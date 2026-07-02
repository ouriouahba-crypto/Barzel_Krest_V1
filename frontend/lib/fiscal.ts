// Barèmes fiscaux portugais officiels 2026 — page Fiscalité + simulateur
// d'acquisition. Tout est vérifiable par le client : limites IMT 2026 (tables
// AT du 06-01-2026, +2% vs 2025), parcelas a abater reconstituées par
// continuité exacte du barème (CIMT art. 17), Imposto do Selo, IMI/AIMI, IRC
// (OE 2026). Le moteur consomme les mêmes réalités fiscales (IMT effectif,
// selo, IMI, IRC + derramas) — cette page les rend lisibles.

import { PmRow } from "./priceMargin";
import { RdRow } from "./rendement";
import { classLabel, median, verdictTone } from "./scoring";

// IMT 2026 — prédios urbanos destinés à l'habitation NON própria e permanente
// (« habitação secundária », le cas investisseur), continent. Tranches
// marginales avec parcela a abater, puis taux uniques.
export interface ImtBracket {
  upTo: number | null;   // borne supérieure de la tranche (null = au-delà)
  rate: number;          // taux %
  abate: number;         // parcela a abater €
  single?: boolean;      // taux unique (pas de parcela)
}
export const IMT_SECONDARY_2026: ImtBracket[] = [
  { upTo: 106346, rate: 1.0, abate: 0 },
  { upTo: 145470, rate: 2.0, abate: 1063.46 },
  { upTo: 198347, rate: 5.0, abate: 5427.57 },
  { upTo: 330539, rate: 7.0, abate: 9394.52 },
  { upTo: 660982, rate: 8.0, abate: 12699.91 },
  { upTo: 1150853, rate: 6.0, abate: 0, single: true },
  { upTo: null, rate: 7.5, abate: 0, single: true },
];
// Prédios urbanos não habitacionais (« outros ») et terrains à bâtir.
export const IMT_COMMERCIAL_PCT = 6.5;
export const SELO_PCT = 0.8;               // Imposto do Selo (verba 1.1)
export const IMI_MIN_PCT = 0.3;            // IMI urbain — taux communal
export const IMI_MAX_PCT = 0.45;
export const AIMI_COMPANY_PCT = 0.4;       // AIMI, patrimoine résidentiel en société
export const IRC_BASE_PCT = 19;            // IRC 2026 (OE 2026)
export const IRC_EFFECTIVE_PCT = 21;       // IRC + derrama municipale (≤1,5%) / estadual

export function imtResidential(price: number): number {
  for (const b of IMT_SECONDARY_2026) {
    if (b.upTo == null || price <= b.upTo) {
      return Math.max(0, (price * b.rate) / 100 - b.abate);
    }
  }
  return 0;
}
export function imtCommercial(price: number): number {
  return (price * IMT_COMMERCIAL_PCT) / 100;
}
export function selo(price: number): number {
  return (price * SELO_PCT) / 100;
}
export function acquisitionTaxes(price: number, residential: boolean) {
  const imt = residential ? imtResidential(price) : imtCommercial(price);
  const is = selo(price);
  return { imt, selo: is, total: imt + is, pct: ((imt + is) / price) * 100 };
}

// One deterministic sentence per class on the fiscal weight of the cycle —
// computed from the same engine-served rows as the mode pages.
const ENTRY_PCT = IMT_COMMERCIAL_PCT + SELO_PCT; // foncier / commercial : 7,3%

export function fiscalInsight(cls: string, pm: PmRow[], rd: RdRow[]): string {
  if (cls === "residential") {
    // Cycle promotion : IMT+selo sur le foncier à l'entrée, IRC effectif sur la
    // marge à la sortie — en % du prix de sortie, médiane des freguesias viables.
    const xs = pm
      .filter((r) => verdictTone("promotion", r.verdict) !== "low" && r.marginPct > 0)
      .map((r) => {
        const entry = (ENTRY_PCT / 100) * r.land;
        const exit = (IRC_EFFECTIVE_PCT / 100) * (r.netSale - r.costTotal);
        return ((entry + exit) / r.realizable) * 100;
      });
    const x = median(xs);
    if (x == null) return "Chargement du cycle fiscal…";
    return `Sur un cycle promotion résidentiel à Gaia, la fiscalité représente ~${x.toFixed(0)}% du prix de sortie, concentrée à l'acquisition du foncier et à la cession.`;
  }
  // Cycle détention commercial : IMI (part fiscalité du loyer) + IRC sur les
  // loyers nets — en % du loyer annuel, médiane des freguesias viables.
  const xs = rd
    .filter((r) => verdictTone("detention", r.verdict) !== "low")
    .map((r) => r.fiscPctLoyer + (IRC_EFFECTIVE_PCT / 100) * (100 - r.chargesPctLoyer - r.fiscPctLoyer));
  const x = median(xs);
  if (x == null) return "Chargement du cycle fiscal…";
  return `Sur un cycle détention ${classLabel(cls).toLowerCase()} à Gaia, la fiscalité absorbe ~${x.toFixed(0)}% du loyer annuel (IMI puis IRC sur les loyers nets), après ~${ENTRY_PCT.toLocaleString("fr-FR")}% du prix à l'entrée.`;
}
