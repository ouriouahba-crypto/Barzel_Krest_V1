// Régime fiscal belge, Région de Bruxelles-Capitale, cadré investisseur
// institutionnel (véhicule société, PAS primo-acquéreur). Page Fiscalité de
// Bruxelles. Faits réels 2025 : droits d'enregistrement 12,5% sur l'existant
// (pleine base ; abattement 200 000 € réservé aux personnes physiques en
// résidence principale), neuf assujetti à la TVA 21%, terrain à bâtir 12,5%,
// précompte immobilier régional annuel, impôt des sociétés 25%. Repère :
// Wallonie 3% et Flandre 2% pour l'habitation propre et unique.
//
// Implémente RegimeFiscal (lib/regimes) : mêmes composants de page que le régime
// PT, contenu belge. Aucun barème inventé : tout est ancré sur les faits
// ci-dessus. Le simulateur interactif (curseur) est un lot 2b-ii distinct.

import type { RegimeFiscal, FiscalVolet } from "./regimes";
import type { PmRow } from "./priceMargin";
import type { RdRow } from "./rendement";
import { median, verdictTone } from "./scoring";
import { translate, type Lang } from "./i18n";
import { classLabelFor } from "./i18n/domain";

// Taux réels (Région de Bruxelles-Capitale, 2025).
export const DROITS_BXL_PCT = 12.5;   // droits d'enregistrement, existant, pleine base
export const TVA_NEUF_PCT = 21;       // construction neuve assujettie
export const NOTAIRE_FRAIS_PCT = 2.0; // notaire + frais d'acte et divers (ordre de grandeur)
export const ISOC_PCT = 25;           // impôt des sociétés
export const WALLONIE_PROPRE_PCT = 3; // habitation propre et unique
export const FLANDRE_PROPRE_PCT = 2;  // habitation propre et unique

export const eurFR = (v: number) => `${Math.round(v).toLocaleString("fr-FR")} €`;
export const pctFR = (v: number, d = 1) =>
  `${v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

// Droits + notaire à l'acquisition (existant, société). Résidentiel et
// commercial existant : même base 12,5% en Belgique (barème plat, contrairement
// à l'IMT progressif portugais). `imt` = droits, `selo` = notaire + frais :
// les colonnes du tableau portent les libellés belges (PAGE.checkpointCols).
export function acquisitionTaxes(price: number, _residential: boolean) {
  const droits = (price * DROITS_BXL_PCT) / 100;
  const frais = (price * NOTAIRE_FRAIS_PCT) / 100;
  return { imt: droits, selo: frais, total: droits + frais, pct: ((droits + frais) / price) * 100 };
}

export function entryMaxPct(_residential: boolean): number {
  return DROITS_BXL_PCT + NOTAIRE_FRAIS_PCT; // ~14,5%
}

export const CHECKPOINTS = [400_000, 1_500_000, 4_000_000];

// Poids fiscal du cycle, calculé sur les mêmes lignes servies par le moteur.
export function fiscalInsight(
  cls: string,
  pm: PmRow[],
  rd: RdRow[],
  cityName = "Bruxelles",
  lang: Lang = "fr",
): string {
  if (cls === "residential") {
    // Cycle promotion : TVA 21% sur le neuf (le moteur la déduit déjà du prix de
    // sortie) + droits d'enregistrement 12,5% sur le foncier, en % du prix de
    // sortie, médiane des communes viables.
    const xs = pm
      .filter((r) => verdictTone("promotion", r.verdict) !== "low")
      .map((r) => (((r.realizable - r.netSale) + (DROITS_BXL_PCT / 100) * r.land) / r.realizable) * 100);
    const x = median(xs);
    if (x == null) return translate("fsx.be.insight.loading", lang);
    return translate("fsx.be.insight.promo", lang, { city: cityName, x: x.toFixed(0) });
  }
  // Cycle détention : précompte immobilier annuel + impôt des sociétés 25% sur
  // les loyers nets, en % du loyer annuel, médiane des communes viables.
  const xs = rd
    .filter((r) => verdictTone("detention", r.verdict) !== "low")
    .map((r) => r.fiscPctLoyer + (ISOC_PCT / 100) * (100 - r.chargesPctLoyer - r.fiscPctLoyer));
  const x = median(xs);
  if (x == null) return translate("fsx.be.insight.loading", lang);
  return translate("fsx.be.insight.detention", lang, {
    city: cityName,
    x: x.toFixed(0),
    cls: classLabelFor(cls, lang).toLowerCase(),
    entry: pctFR(DROITS_BXL_PCT + NOTAIRE_FRAIS_PCT),
  });
}

// Les `value` (pctFR(...), "annuel", "réf. +20%", "usuelle", "selon régime") sont
// des valeurs calculées ou des données de régime : hors dictionnaire. Seuls la
// prose et les libellés sont traduits.
export function volets(lang: Lang): FiscalVolet[] {
  const T = (k: string) => translate(k, lang);
  return [
    {
      title: T("fsx.be.acq.title"),
      eyebrow: T("fsx.be.acq.eyebrow"),
      rows: [
        {
          label: T("fsx.be.acq.droits.label"),
          value: pctFR(DROITS_BXL_PCT),
          sub: T("fsx.be.acq.droits.sub"),
        },
        {
          label: T("fsx.be.acq.tva.label"),
          value: pctFR(TVA_NEUF_PCT, 0),
          sub: T("fsx.be.acq.tva.sub"),
        },
        {
          label: T("fsx.be.acq.terrain.label"),
          value: pctFR(DROITS_BXL_PCT),
          sub: T("fsx.be.acq.terrain.sub"),
        },
        {
          label: T("fsx.be.acq.notaire.label"),
          value: `~${pctFR(NOTAIRE_FRAIS_PCT)}`,
          sub: T("fsx.be.acq.notaire.sub"),
        },
      ],
      platform: { to: "/prix-marge", label: T("fsx.be.acq.platform") },
    },
    {
      title: T("fsx.be.det.title"),
      eyebrow: T("fsx.be.det.eyebrow"),
      rows: [
        {
          label: T("fsx.be.det.precompte.label"),
          value: "annuel",
          sub: T("fsx.be.det.precompte.sub"),
        },
        {
          label: T("fsx.be.det.isoc.label"),
          value: pctFR(ISOC_PCT, 0),
          sub: T("fsx.be.det.isoc.sub"),
        },
        {
          label: T("fsx.be.det.encadrement.label"),
          value: "réf. +20%",
          sub: T("fsx.be.det.encadrement.sub"),
        },
      ],
      platform: { to: "/rendement", label: T("fsx.be.det.platform") },
    },
    {
      title: T("fsx.be.ced.title"),
      eyebrow: T("fsx.be.ced.eyebrow"),
      rows: [
        {
          label: T("fsx.be.ced.pv.label"),
          value: pctFR(ISOC_PCT, 0),
          sub: T("fsx.be.ced.pv.sub"),
        },
        {
          label: T("fsx.be.ced.shareDeal.label"),
          value: "usuelle",
          sub: T("fsx.be.ced.shareDeal.sub"),
        },
        {
          label: T("fsx.be.ced.exitTax.label"),
          value: "selon régime",
          sub: T("fsx.be.ced.exitTax.sub"),
        },
      ],
      platform: { to: "/arbitrage", label: T("fsx.be.ced.platform") },
    },
  ];
}

// Textes de page du régime BE : des CLÉS, résolues par la page via t().
// `chipPrefix` reste une donnée (nom de ville/pays, non traduit).
export const PAGE = {
  marketLine: "fsx.be.page.marketLine",
  chipPrefix: "Bruxelles",
  intro: "fsx.be.page.intro",
  bannerEyebrowPrefix: "fsx.be.page.bannerEyebrowPrefix",
  entryMaxLabel: "fsx.be.page.entryMaxLabel",
  entryMaxSub: "fsx.be.page.entryMaxSub",
  checkpointsTitle: (residential: boolean) =>
    residential ? "fsx.be.page.checkpointsTitleRes" : "fsx.be.page.checkpointsTitleCom",
  checkpointsSub: "fsx.be.page.checkpointsSub",
  checkpointCols: [
    "fsx.be.page.col.price",
    "fsx.be.page.col.droits",
    "fsx.be.page.col.notaire",
    "fsx.be.page.col.total",
    "fsx.be.page.col.pct",
  ],
  baremeNote: "fsx.be.page.baremeNote",
  simulatorCaption: "fsx.be.page.simulatorCaption",
  sources: "fsx.be.page.sources",
};

// Vérification structurelle : ce module satisfait le contrat RegimeFiscal.
export const __regimeCheck: RegimeFiscal = {
  fiscalInsight, entryMaxPct, acquisitionTaxes, volets, CHECKPOINTS, eurFR, pctFR, PAGE,
};
