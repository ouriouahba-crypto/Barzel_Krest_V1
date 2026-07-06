// Barèmes fiscaux portugais officiels 2026 : page Fiscalité + simulateur
// d'acquisition. Tout est vérifiable par le client : limites IMT 2026 (tables
// AT du 06-01-2026, +2% vs 2025), parcelas a abater reconstituées par
// continuité exacte du barème (CIMT art. 17), Imposto do Selo, IMI/AIMI, IRC
// (OE 2026). Le moteur consomme les mêmes réalités fiscales (IMT effectif,
// selo, IMI, IRC + derramas) ; cette page les rend lisibles.

import { PmRow } from "./priceMargin";
import { RdRow } from "./rendement";
import { classLabel, median, verdictTone } from "./scoring";

// IMT 2026 : prédios urbanos destinés à l'habitation NON própria e permanente
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
export const IMI_MIN_PCT = 0.3;            // IMI urbain, taux communal
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

// One deterministic sentence per class on the fiscal weight of the cycle,
// computed from the same engine-served rows as the mode pages.
const ENTRY_PCT = IMT_COMMERCIAL_PCT + SELO_PCT; // foncier / commercial : 7,3%

export function fiscalInsight(cls: string, pm: PmRow[], rd: RdRow[], cityName: string = "Gaia"): string {
  if (cls === "residential") {
    // Cycle promotion : IMT+selo sur le foncier à l'entrée, IRC effectif sur la
    // marge à la sortie, en % du prix de sortie, médiane des freguesias viables.
    const xs = pm
      .filter((r) => verdictTone("promotion", r.verdict) !== "low" && r.marginPct > 0)
      .map((r) => {
        const entry = (ENTRY_PCT / 100) * r.land;
        const exit = (IRC_EFFECTIVE_PCT / 100) * (r.netSale - r.costTotal);
        return ((entry + exit) / r.realizable) * 100;
      });
    const x = median(xs);
    if (x == null) return "Chargement du cycle fiscal…";
    return `Sur un cycle promotion résidentiel à ${cityName}, la fiscalité représente ~${x.toFixed(0)}% du prix de sortie, concentrée à l'acquisition du foncier et à la cession.`;
  }
  // Cycle détention commercial : IMI (part fiscalité du loyer) + IRC sur les
  // loyers nets, en % du loyer annuel, médiane des freguesias viables.
  const xs = rd
    .filter((r) => verdictTone("detention", r.verdict) !== "low")
    .map((r) => r.fiscPctLoyer + (IRC_EFFECTIVE_PCT / 100) * (100 - r.chargesPctLoyer - r.fiscPctLoyer));
  const x = median(xs);
  if (x == null) return "Chargement du cycle fiscal…";
  return `Sur un cycle détention ${classLabel(cls).toLowerCase()} à ${cityName}, la fiscalité absorbe ~${x.toFixed(0)}% du loyer annuel (IMI puis IRC sur les loyers nets), après ~${ENTRY_PCT.toLocaleString("fr-FR")}% du prix à l'entrée.`;
}

// --------------------------------------------------------------------------- #
// Contenu de page du régime fiscal PT (page Fiscalité). Un régime BE exposera  #
// la même interface (PAGE, volets, CHECKPOINTS…) : la page ne change pas.      #
// --------------------------------------------------------------------------- #

export const eurFR = (v: number) => `${Math.round(v).toLocaleString("fr-FR")} €`;
export const pctFR = (v: number, d = 1) =>
  `${v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

// Points de contrôle fixes, rendus des mêmes fonctions que le simulateur.
export const CHECKPOINTS = [400_000, 1_500_000, 4_000_000];

export function entryMaxPct(residential: boolean): number {
  return residential ? 7.5 + SELO_PCT : IMT_COMMERCIAL_PCT + SELO_PCT;
}

export interface FiscalRow {
  label: string;
  value: string;
  sub?: string;
}
export interface FiscalVolet {
  title: string;
  eyebrow: string;
  rows: FiscalRow[];
  platform: { to: string; label: string };
}

export function volets(): FiscalVolet[] {
  return [
    {
      title: "Acquérir",
      eyebrow: "À la signature",
      rows: [
        {
          label: "IMT · habitation (investisseur)",
          value: "1% → 8%",
          sub: `barème progressif ; taux uniques 6% (${(660_982).toLocaleString("fr-FR")} – ${(1_150_853).toLocaleString("fr-FR")} €) et 7,5% au-delà`,
        },
        {
          label: "IMT · commercial & terrains à bâtir",
          value: pctFR(IMT_COMMERCIAL_PCT),
          sub: "prédios não habitacionais : taux unique",
        },
        {
          label: "Non-résidents · résidentiel (dès 01/09/2026)",
          value: pctFR(7.5),
          sub: "taux fixe (DL 97/2026) ; remboursable si résidence fiscale sous 2 ans ou location à loyer modéré (≤ 2 300 €/mois)",
        },
        { label: "Imposto do Selo", value: pctFR(SELO_PCT), sub: "sur le prix d'acquisition (verba 1.1)" },
      ],
      platform: { to: "/prix-marge", label: "intégré au coût du foncier de la cascade Prix & marge" },
    },
    {
      title: "Détenir",
      eyebrow: "Chaque année",
      rows: [
        {
          label: "IMI · prédios urbains",
          value: `${pctFR(IMI_MIN_PCT, 2)} – ${pctFR(IMI_MAX_PCT, 2)}`,
          sub: "par an sur la VPT, taux fixé par le município",
        },
        {
          label: "AIMI · véhicule société",
          value: pctFR(AIMI_COMPANY_PCT),
          sub: "par an sur le patrimoine résidentiel détenu en société",
        },
        {
          label: "IRC sur les loyers nets",
          value: pctFR(IRC_BASE_PCT, 0),
          sub: "véhicule société ; + derramas selon la commune",
        },
      ],
      platform: { to: "/rendement", label: "intégré à la ligne Fiscalité de la cascade Rendement" },
    },
    {
      title: "Céder",
      eyebrow: "À la sortie",
      rows: [
        {
          label: "Plus-values en IRC",
          value: pctFR(IRC_BASE_PCT, 0),
          sub: "résultat de cession imposé au taux IRC 2026",
        },
        {
          label: "Derrama municipale & estadual",
          value: "≤ 1,5% + prog.",
          sub: "selon la commune et le résultat",
        },
        {
          label: "Taux effectif retenu",
          value: `~${pctFR(IRC_EFFECTIVE_PCT, 0)}`,
          sub: "IRC + derramas, celui des verdicts de la plateforme",
        },
      ],
      platform: { to: "/arbitrage", label: "intégré aux frictions de sortie d'Arbitrage (et à la marge nette de Promotion)" },
    },
  ];
}

// Textes de page du régime PT (déplacés de app/fiscalite/page.tsx, verbatim).
export const PAGE = {
  // Libellé NEUTRE (aucune ville nommée) : repli commun du régime PT, chaque
  // ville PT porte son propre `texts.fiscaliteMarketLine` (cf. lib/cities.ts).
  marketLine:
    "Portugal : ce que le fisc prend à chaque étape, et comment c'est déjà intégré dans nos verdicts.",
  chipPrefix: "Portugal",
  intro:
    "Acquérir, détenir, céder : les prélèvements portugais aux taux officiels 2026, et l'endroit exact où chacun est déjà compté dans les cascades de la plateforme.",
  bannerEyebrowPrefix: "Poids fiscal du cycle",
  entryMaxLabel: "Frais d'entrée max",
  entryMaxSub: "IMT + imposto do selo",
  checkpointsTitle: (residential: boolean) =>
    `Points de contrôle · ${residential ? "habitation (investisseur)" : "commercial"}`,
  checkpointsSub: "Mêmes formules que le simulateur ; chaque ligne est vérifiable sur le barème officiel.",
  checkpointCols: ["Prix d'acquisition", "IMT", "Imposto do selo", "Total entrée", "% du prix"],
  baremeNote: `Barème habitação secundária (continent) : ${IMT_SECONDARY_2026.length - 2} tranches marginales de 1% à 8% avec parcela a abater, puis taux uniques de 6% (660 982 – 1 150 853 €) et 7,5% au-delà.`,
  simulatorCaption:
    "Simulateur temps réel sur le barème en vigueur : déplacez le prix pour voir l'IMT, le selo et le total d'entrée se recalculer.",
  sources:
    "Barèmes officiels PT 2026 : IMT (CIMT art. 17, tables du 06-01-2026), Imposto do Selo, IMI/AIMI, IRC (OE 2026), non-résidents (DL 97/2026, du 20 mai).",
};
