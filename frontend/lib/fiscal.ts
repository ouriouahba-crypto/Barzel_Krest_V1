// Barèmes fiscaux portugais officiels 2026 : page Fiscalité + simulateur
// d'acquisition. Tout est vérifiable par le client : limites IMT 2026 (tables
// AT du 06-01-2026, +2% vs 2025), parcelas a abater reconstituées par
// continuité exacte du barème (CIMT art. 17), Imposto do Selo, IMI/AIMI, IRC
// (OE 2026). Le moteur consomme les mêmes réalités fiscales (IMT effectif,
// selo, IMI, IRC + derramas) ; cette page les rend lisibles.

import { PmRow } from "./priceMargin";
import { RdRow } from "./rendement";
import { median, verdictTone } from "./scoring";
import { translate, type Lang } from "./i18n";
import { classLabelFor } from "./i18n/domain";
import { fmtNumber } from "./i18n/format";

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

export function fiscalInsight(
  cls: string,
  pm: PmRow[],
  rd: RdRow[],
  cityName: string = "Gaia",
  lang: Lang = "fr",
): string {
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
    if (x == null) return translate("fsx.pt.insight.loading", lang);
    return translate("fsx.pt.insight.promo", lang, { city: cityName, x: x.toFixed(0) });
  }
  // Cycle détention commercial : IMI (part fiscalité du loyer) + IRC sur les
  // loyers nets, en % du loyer annuel, médiane des freguesias viables.
  const xs = rd
    .filter((r) => verdictTone("detention", r.verdict) !== "low")
    .map((r) => r.fiscPctLoyer + (IRC_EFFECTIVE_PCT / 100) * (100 - r.chargesPctLoyer - r.fiscPctLoyer));
  const x = median(xs);
  if (x == null) return translate("fsx.pt.insight.loading", lang);
  return translate("fsx.pt.insight.detention", lang, {
    city: cityName,
    x: x.toFixed(0),
    cls: classLabelFor(cls, lang).toLowerCase(),
    entry: fmtNumber(ENTRY_PCT, lang),
  });
}

// --------------------------------------------------------------------------- #
// Contenu de page du régime fiscal PT (page Fiscalité). Un régime BE exposera  #
// la même interface (PAGE, volets, CHECKPOINTS…) : la page ne change pas.      #
// --------------------------------------------------------------------------- #

// Barèmes de la page Fiscalité. Milliers localisés (eurFR) ET décimale localisée
// (pctFR : « 6,5% » en fr/pt, « 6.5% » en en). pctFR est le seul formateur à
// décimale localisée de la plateforme : le scoring (fmtNum/fmtSigned/pctSigned)
// garde son point décimal dans les 3 langues, par choix.
export const eurFR = (v: number, lang: Lang) => `${fmtNumber(Math.round(v), lang)} €`;
export const pctFR = (v: number, lang: Lang, d = 1) =>
  `${fmtNumber(v, lang, { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

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

// Les `value` (pctFR(...), "1% → 8%", "≤ 1,5% + prog."…) sont des VALEURS
// calculées ou des barèmes : elles ne passent pas par le dictionnaire. Seuls la
// prose et les libellés sont traduits.
export function volets(lang: Lang): FiscalVolet[] {
  const T = (k: string, p?: Record<string, string | number>) => translate(k, lang, p);
  return [
    {
      title: T("fsx.pt.acq.title"),
      eyebrow: T("fsx.pt.acq.eyebrow"),
      rows: [
        {
          label: T("fsx.pt.acq.imtHab.label"),
          value: "1% → 8%",
          sub: T("fsx.pt.acq.imtHab.sub", {
            a: fmtNumber(660_982, lang),
            b: fmtNumber(1_150_853, lang),
          }),
        },
        {
          label: T("fsx.pt.acq.imtCom.label"),
          value: pctFR(IMT_COMMERCIAL_PCT, lang),
          sub: T("fsx.pt.acq.imtCom.sub"),
        },
        {
          label: T("fsx.pt.acq.nonRes.label"),
          value: pctFR(7.5, lang),
          sub: T("fsx.pt.acq.nonRes.sub"),
        },
        { label: T("fsx.pt.acq.selo.label"), value: pctFR(SELO_PCT, lang), sub: T("fsx.pt.acq.selo.sub") },
      ],
      platform: { to: "/prix-marge", label: T("fsx.pt.acq.platform") },
    },
    {
      title: T("fsx.pt.det.title"),
      eyebrow: T("fsx.pt.det.eyebrow"),
      rows: [
        {
          label: T("fsx.pt.det.imi.label"),
          value: `${pctFR(IMI_MIN_PCT, lang, 2)} – ${pctFR(IMI_MAX_PCT, lang, 2)}`,
          sub: T("fsx.pt.det.imi.sub"),
        },
        {
          label: T("fsx.pt.det.aimi.label"),
          value: pctFR(AIMI_COMPANY_PCT, lang),
          sub: T("fsx.pt.det.aimi.sub"),
        },
        {
          label: T("fsx.pt.det.irc.label"),
          value: pctFR(IRC_BASE_PCT, lang, 0),
          sub: T("fsx.pt.det.irc.sub"),
        },
      ],
      platform: { to: "/rendement", label: T("fsx.pt.det.platform") },
    },
    {
      title: T("fsx.pt.ced.title"),
      eyebrow: T("fsx.pt.ced.eyebrow"),
      rows: [
        {
          label: T("fsx.pt.ced.pv.label"),
          value: pctFR(IRC_BASE_PCT, lang, 0),
          sub: T("fsx.pt.ced.pv.sub"),
        },
        {
          label: T("fsx.pt.ced.derrama.label"),
          value: "≤ 1,5% + prog.",
          sub: T("fsx.pt.ced.derrama.sub"),
        },
        {
          label: T("fsx.pt.ced.effectif.label"),
          value: `~${pctFR(IRC_EFFECTIVE_PCT, lang, 0)}`,
          sub: T("fsx.pt.ced.effectif.sub"),
        },
      ],
      platform: { to: "/arbitrage", label: T("fsx.pt.ced.platform") },
    },
  ];
}

// Textes de page du régime PT : désormais des CLÉS de dictionnaire, résolues par
// la page via t(). `chipPrefix` reste une donnée (nom de pays, non traduit).
// `baremeNote` garde sa dérivation vivante depuis IMT_SECONDARY_2026 : le nombre
// de tranches marginales voyage en token {n} (cf. baremeParams).
export const PAGE = {
  // Libellé NEUTRE (aucune ville nommée) : repli commun du régime PT, chaque
  // ville PT porte son propre `texts.fiscaliteMarketLine` (cf. lib/cities.ts).
  marketLine: "fsx.pt.page.marketLine",
  chipPrefix: "Portugal",
  intro: "fsx.pt.page.intro",
  bannerEyebrowPrefix: "fsx.pt.page.bannerEyebrowPrefix",
  entryMaxLabel: "fsx.pt.page.entryMaxLabel",
  entryMaxSub: "fsx.pt.page.entryMaxSub",
  checkpointsTitle: (residential: boolean) =>
    residential ? "fsx.pt.page.checkpointsTitleRes" : "fsx.pt.page.checkpointsTitleCom",
  checkpointsSub: "fsx.pt.page.checkpointsSub",
  checkpointCols: [
    "fsx.pt.page.col.price",
    "fsx.pt.page.col.imt",
    "fsx.pt.page.col.selo",
    "fsx.pt.page.col.total",
    "fsx.pt.page.col.pct",
  ],
  baremeNote: "fsx.pt.page.baremeNote",
  baremeParams: { n: IMT_SECONDARY_2026.length - 2 },
  simulatorCaption: "fsx.pt.page.simulatorCaption",
  sources: "fsx.pt.page.sources",
};
