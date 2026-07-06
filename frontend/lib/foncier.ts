// Shared shaping for the "Foncier" module: turn a landbank CityResponse into
// per-freguesia rows carrying the constructibilité pillar's structured residual
// land economics. Mirrors the other mode libs.

import { CityResponse, LandbankBreakdown, LandbankUsage } from "./api";
import { median, verdictTone } from "./scoring";
import { displayName, shortName } from "./useGaia";

export interface FcRow {
  zone: string;
  name: string;
  short: string;
  total: number;                 // landbank score /100
  verdict: string;
  constructibilite: number;      // /100
  meilleurUsage: string;         // libellé FR (résidentiel, bureaux…)
  prixRealisable: number;        // €/m² du meilleur usage
  foncierMarche: number;         // €/m² (foncier promotion du meilleur usage)
  valeurResiduelle: number;      // €/m²
  upliftPct: number;             // vs foncier marché, borné -40..+80
  horizon: string;               // immédiat / 2-4 ans / au-delà
  usages: Record<string, LandbankUsage>;
  weakest: string | null;        // pilier applicable le plus faible (insight)
}

function toRow(z: CityResponse["zones"][number]): FcRow | null {
  const cp = z.pillars.find((p) => p.pillar === "constructibilite");
  const b = cp?.breakdown as LandbankBreakdown | undefined;
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
    constructibilite: b.constructibilite,
    meilleurUsage: b.meilleur_usage,
    prixRealisable: b.prix_realisable_meilleur_usage_eur_m2,
    foncierMarche: b.foncier_marche_eur_m2,
    valeurResiduelle: b.valeur_residuelle_eur_m2,
    upliftPct: b.uplift_pct,
    horizon: b.horizon_activation,
    usages: b.usages,
    weakest,
  };
}

// Freguesia-level rows only, best uplift first by default.
export function fcRows(city?: CityResponse): FcRow[] {
  if (!city) return [];
  return city.zones
    .filter((z) => z.level !== "municipio")
    .map(toRow)
    .filter((r): r is FcRow => r !== null)
    .sort((a, b) => b.upliftPct - a.upliftPct);
}

export interface FcSummary {
  medianUplift: number | null;
  medianConstructibilite: number | null;
  usageDominant: string | null;       // meilleur usage le plus fréquent (viables)
  prioCount: number;                  // Prioritaires (sur toutes)
  totalCount: number;
  scope: "viables" | "toutes";        // basis of the medians
}

// Medians on viable freguesias only (Prioritaire / À phaser); if none viable,
// fall back to all freguesias (scope flagged accordingly).
export function fcSummary(rows: FcRow[]): FcSummary {
  if (!rows.length)
    return { medianUplift: null, medianConstructibilite: null, usageDominant: null, prioCount: 0, totalCount: 0, scope: "toutes" };
  const viable = rows.filter((r) => verdictTone("landbank", r.verdict) !== "low");
  const use = viable.length ? viable : rows;
  const counts = new Map<string, number>();
  for (const r of use) counts.set(r.meilleurUsage, (counts.get(r.meilleurUsage) ?? 0) + 1);
  const usageDominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    medianUplift: median(use.map((r) => r.upliftPct)),
    medianConstructibilite: median(use.map((r) => r.constructibilite)),
    usageDominant,
    prioCount: rows.filter((r) => verdictTone("landbank", r.verdict) === "good").length,
    totalCount: rows.length,
    scope: viable.length ? "viables" : "toutes",
  };
}
