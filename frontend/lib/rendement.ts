// Shared shaping for the "Rendement" module: turn a detention CityResponse into
// per-freguesia rows carrying the rendement_net pillar's structured yield stack.
// Mirrors lib/priceMargin.ts ; reused by the table, the yield waterfall, the bar
// chart and the key figures.

import { CityResponse, RendementBreakdown } from "./api";
import { fmtNum, median, verdictTone } from "./scoring";
import { displayName, shortName } from "./useGaia";

export interface RdRow {
  zone: string;
  name: string;
  short: string;
  total: number;             // detention score /100
  verdict: string;
  median: number | null;     // prix médian de marché €/m² (base « actif type » énergie)
  loyer: number | null;      // loyer de marché €/m²/an
  yieldBrut: number;         // yield brut % (ajusté zone)
  chargesPctLoyer: number;   // charges + vacance, % du loyer
  fiscPctLoyer: number;      // fiscalité de détention, % du loyer
  yieldNet: number;          // yield net %
  weakest: string | null;    // pilier applicable le plus faible (pour l'insight)
}

function toRow(z: CityResponse["zones"][number]): RdRow | null {
  const rend = z.pillars.find((p) => p.pillar === "rendement_net");
  const b = rend?.breakdown as RendementBreakdown | undefined;
  if (!b) return null;
  const weakest =
    z.pillars
      .filter((p) => p.applicable && p.subscore != null)
      .sort((a, b2) => (a.subscore ?? 100) - (b2.subscore ?? 100))[0]?.pillar ?? null;
  return {
    zone: z.zone,
    name: displayName(z.zone_name),
    short: shortName(z.zone_name),
    total: z.total,
    verdict: z.verdict,
    median: z.median_eur_m2 ?? null,
    loyer: b.loyer_marche_eur_m2_an,
    yieldBrut: b.yield_brut_pct,
    chargesPctLoyer: b.charges_pct_loyer,
    fiscPctLoyer: b.fiscalite_pct_loyer,
    yieldNet: b.yield_net_pct,
    weakest,
  };
}

// Freguesia-level rows only, richest net yield first by default.
export function rdRows(city?: CityResponse): RdRow[] {
  if (!city) return [];
  return city.zones
    .filter((z) => z.level !== "municipio")
    .map(toRow)
    .filter((r): r is RdRow => r !== null)
    .sort((a, b) => b.yieldNet - a.yieldNet);
}

export interface RdSummary {
  medianYieldNet: number | null;
  medianYieldBrut: number | null;
  medianLoyer: number | null;
  cederCount: number;                 // freguesias au verdict Céder (sur toutes)
  totalCount: number;
  best: RdRow | null;                 // highest net yield (over all)
  scope: "viables" | "toutes";        // basis of the medians
}

// Medians on viable freguesias only (verdict Conserver/Surveiller); if a class
// has none viable, fall back to all freguesias (scope flagged accordingly).
export function rdSummary(rows: RdRow[]): RdSummary {
  if (!rows.length)
    return { medianYieldNet: null, medianYieldBrut: null, medianLoyer: null, cederCount: 0, totalCount: 0, best: null, scope: "toutes" };
  const best = rows.reduce((a, b) => (b.yieldNet > a.yieldNet ? b : a));
  const viable = rows.filter((r) => verdictTone("detention", r.verdict) !== "low");
  const use = viable.length ? viable : rows;
  return {
    medianYieldNet: median(use.map((r) => r.yieldNet)),
    medianYieldBrut: median(use.map((r) => r.yieldBrut)),
    medianLoyer: median(use.map((r) => r.loyer).filter((v): v is number => v != null)),
    cederCount: rows.length - viable.length,
    totalCount: rows.length,
    best,
    scope: viable.length ? "viables" : "toutes",
  };
}

export const pct2 = (v: number | null | undefined) =>
  v != null ? `${fmtNum(v, 2)}%` : "–";
