// Shared shaping for the "Prix & marge" module: turn a promotion CityResponse
// into per-freguesia rows carrying the marge pillar's structured cost stack.
// Reused by the table, the margin waterfall, the bar chart and the key figures.

import { CityResponse, MargeBreakdown } from "./api";
import { fmtNum, median, verdictTone } from "./scoring";
import { displayName, shortName } from "./useGaia";

export interface PmRow {
  zone: string;
  name: string;
  short: string;
  total: number;            // promotion score /100
  verdict: string;
  baseMedian: number | null;   // prix ancien médian (résidentiel)
  premiumPct: number | null;   // prime neuf %
  realizable: number;          // prix neuf réalisable €/m²
  construction: number;
  land: number;                // foncier €/m²
  soft: number;                // frais annexes €/m²
  finance: number;             // financement €/m²
  netSale: number;             // prix net de TVA €/m²
  costTotal: number;
  marginPct: number;
}

function toRow(z: CityResponse["zones"][number]): PmRow | null {
  const marge = z.pillars.find((p) => p.pillar === "marge");
  const b = marge?.breakdown as MargeBreakdown | undefined;
  if (!b) return null;
  return {
    zone: z.zone,
    name: displayName(z.zone_name),
    short: shortName(z.zone_name),
    total: z.total,
    verdict: z.verdict,
    baseMedian: b.base_median,
    premiumPct: b.premium_pct,
    realizable: b.realizable_sale,
    construction: b.construction,
    land: b.land,
    soft: b.soft,
    finance: b.finance,
    netSale: b.net_sale,
    costTotal: b.cost_total,
    marginPct: b.margin_pct,
  };
}

// Freguesia-level rows only, richest margin first by default.
export function pmRows(city?: CityResponse): PmRow[] {
  if (!city) return [];
  return city.zones
    .filter((z) => z.level === "freguesia")
    .map(toRow)
    .filter((r): r is PmRow => r !== null)
    .sort((a, b) => b.marginPct - a.marginPct);
}

export interface PmSummary {
  medianMargin: number | null;
  medianRealizable: number | null;
  medianCost: number | null;
  medianPremium: number | null;       // prime neuf médiane (viables ; null en commercial)
  medianLand: number | null;          // foncier médian (viables), KPI commercial
  best: PmRow | null;                 // most profitable freguesia (over all)
  scope: "viables" | "toutes";        // basis of the medians
}

// Medians are computed on viable freguesias only (verdict Go/Conditionnel); if a
// class has none viable, fall back to all freguesias (scope flagged accordingly).
export function pmSummary(rows: PmRow[]): PmSummary {
  if (!rows.length)
    return { medianMargin: null, medianRealizable: null, medianCost: null, medianPremium: null, medianLand: null, best: null, scope: "toutes" };
  const best = rows.reduce((a, b) => (b.marginPct > a.marginPct ? b : a));
  const viable = rows.filter((r) => verdictTone("promotion", r.verdict) !== "low");
  const use = viable.length ? viable : rows;
  return {
    medianMargin: median(use.map((r) => r.marginPct)),
    medianRealizable: median(use.map((r) => r.realizable)),
    medianCost: median(use.map((r) => r.costTotal)),
    medianPremium: median(use.map((r) => r.premiumPct).filter((v): v is number => v != null)),
    medianLand: median(use.map((r) => r.land)),
    best,
    scope: viable.length ? "viables" : "toutes",
  };
}

export const eurM2 = (v: number | null | undefined) =>
  v != null ? `${Math.round(v).toLocaleString("fr-FR")} €/m²` : "–";
export const eur0 = (v: number | null | undefined) =>
  v != null ? Math.round(v).toLocaleString("fr-FR") : "–";
export const pct1 = (v: number | null | undefined) =>
  v != null ? `${fmtNum(v, 1)}%` : "–";
export const pct0 = (v: number | null | undefined) =>
  v != null ? `${fmtNum(v)}%` : "–";
