// Shared shaping for the "Arbitrage" module: turn an arbitrage CityResponse into
// per-freguesia rows carrying the spread pillar's structured disposal economics.
// Mirrors lib/priceMargin.ts and lib/rendement.ts.

import { ArbitrageBreakdown, CityResponse } from "./api";
import { median, pillarValue, verdictTone } from "./scoring";
import { displayName, shortName } from "./useGaia";

export interface ArbRow {
  zone: string;
  name: string;
  short: string;
  total: number;                    // arbitrage score /100
  verdict: string;
  prixMarche: number | null;        // médiane de référence €/m²
  valeurRealisable: number | null;  // valeur de cession €/m²
  spreadPct: number;
  delaiMois: number | null;         // délai de cession estimé (mois)
  fraisPct: number;                 // frais de cession % de la valeur
  decotePct: number | null;         // décote de négociation %
  appetit: string | null;           // appétit institutionnel qualitatif
  weakest: string | null;           // pilier applicable le plus faible (insight)
}

// Institutional appetite as a graded word (same thresholds as the backend label).
export function appetitQual(v: number | null): string | null {
  if (v == null) return null;
  return v >= 0.7 ? "soutenu" : v >= 0.4 ? "modéré" : "faible";
}

// Signed percentage — spreads read as premiums/discounts vs the median.
export const pctSigned = (v: number | null | undefined, digits = 1) =>
  v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%` : "—";

function toRow(z: CityResponse["zones"][number]): ArbRow | null {
  const sp = z.pillars.find((p) => p.pillar === "spread");
  const b = sp?.breakdown as ArbitrageBreakdown | undefined;
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
    prixMarche: b.prix_marche_eur_m2,
    valeurRealisable: b.valeur_realisable_eur_m2,
    spreadPct: b.spread_pct,
    delaiMois: b.delai_cession_mois,
    fraisPct: b.frais_cession_pct,
    decotePct: b.decote_negociation_pct,
    appetit: appetitQual(pillarValue(z.pillars, "appetit_institutionnel")),
    weakest,
  };
}

// Freguesia-level rows only, widest spread first by default.
export function arbRows(city?: CityResponse): ArbRow[] {
  if (!city) return [];
  return city.zones
    .filter((z) => z.level === "freguesia")
    .map(toRow)
    .filter((r): r is ArbRow => r !== null)
    .sort((a, b) => b.spreadPct - a.spreadPct);
}

export interface ArbSummary {
  medianSpread: number | null;
  medianDelai: number | null;
  appetit: string | null;             // dominant qualitative appetite
  openCount: number;                  // fenêtres ouvertes (sur toutes)
  totalCount: number;
  scope: "viables" | "toutes";        // basis of the medians
}

// Medians on viable freguesias only (Fenêtre ouverte/étroite); if a class has
// none viable, fall back to all freguesias (scope flagged accordingly).
export function arbSummary(rows: ArbRow[]): ArbSummary {
  if (!rows.length)
    return { medianSpread: null, medianDelai: null, appetit: null, openCount: 0, totalCount: 0, scope: "toutes" };
  const viable = rows.filter((r) => verdictTone("arbitrage", r.verdict) !== "low");
  const use = viable.length ? viable : rows;
  const counts = new Map<string, number>();
  for (const r of use) if (r.appetit) counts.set(r.appetit, (counts.get(r.appetit) ?? 0) + 1);
  const appetit = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    medianSpread: median(use.map((r) => r.spreadPct)),
    medianDelai: median(use.map((r) => r.delaiMois).filter((v): v is number => v != null)),
    appetit,
    openCount: rows.filter((r) => verdictTone("arbitrage", r.verdict) === "good").length,
    totalCount: rows.length,
    scope: viable.length ? "viables" : "toutes",
  };
}
