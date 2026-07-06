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
import { classLabel, median, verdictTone } from "./scoring";

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
export function fiscalInsight(cls: string, pm: PmRow[], rd: RdRow[], cityName = "Bruxelles"): string {
  if (cls === "residential") {
    // Cycle promotion : TVA 21% sur le neuf (le moteur la déduit déjà du prix de
    // sortie) + droits d'enregistrement 12,5% sur le foncier, en % du prix de
    // sortie, médiane des communes viables.
    const xs = pm
      .filter((r) => verdictTone("promotion", r.verdict) !== "low")
      .map((r) => (((r.realizable - r.netSale) + (DROITS_BXL_PCT / 100) * r.land) / r.realizable) * 100);
    const x = median(xs);
    if (x == null) return "Chargement du cycle fiscal…";
    return `Sur un cycle promotion résidentiel à ${cityName}, la fiscalité représente ~${x.toFixed(0)}% du prix de sortie, dominée par la TVA à 21% sur le neuf et les droits d'enregistrement sur le foncier.`;
  }
  // Cycle détention : précompte immobilier annuel + impôt des sociétés 25% sur
  // les loyers nets, en % du loyer annuel, médiane des communes viables.
  const xs = rd
    .filter((r) => verdictTone("detention", r.verdict) !== "low")
    .map((r) => r.fiscPctLoyer + (ISOC_PCT / 100) * (100 - r.chargesPctLoyer - r.fiscPctLoyer));
  const x = median(xs);
  if (x == null) return "Chargement du cycle fiscal…";
  return `Sur un cycle détention ${classLabel(cls).toLowerCase()} à ${cityName}, la fiscalité absorbe ~${x.toFixed(0)}% du loyer annuel (précompte immobilier puis impôt des sociétés à 25% sur les loyers nets), après ~${pctFR(DROITS_BXL_PCT + NOTAIRE_FRAIS_PCT)} de frais à l'entrée.`;
}

export function volets(): FiscalVolet[] {
  return [
    {
      title: "Acquérir",
      eyebrow: "À la signature",
      rows: [
        {
          label: "Droits d'enregistrement · existant (société)",
          value: pctFR(DROITS_BXL_PCT),
          sub: "pleine base ; abattement de 200 000 € réservé aux personnes physiques en résidence principale, non applicable à un fonds",
        },
        {
          label: "Neuf assujetti · TVA",
          value: pctFR(TVA_NEUF_PCT, 0),
          sub: "régime TVA sur le neuf, pas de droits d'enregistrement",
        },
        {
          label: "Terrain à bâtir",
          value: pctFR(DROITS_BXL_PCT),
          sub: "droits ; abattement de 100 000 € réservé au particulier, non applicable à un fonds",
        },
        {
          label: "Notaire + frais",
          value: `~${pctFR(NOTAIRE_FRAIS_PCT)}`,
          sub: "honoraires, frais d'acte et divers",
        },
      ],
      platform: { to: "/prix-marge", label: "intégré au coût du foncier de la cascade Prix & marge" },
    },
    {
      title: "Détenir",
      eyebrow: "Chaque année",
      rows: [
        {
          label: "Précompte immobilier",
          value: "annuel",
          sub: "taxe régionale sur le revenu cadastral indexé (Bruxelles Fiscalité), taux communal variable",
        },
        {
          label: "Impôt des sociétés · loyers nets",
          value: pctFR(ISOC_PCT, 0),
          sub: "véhicule société (ISoc), sur le résultat locatif",
        },
        {
          label: "Encadrement des loyers",
          value: "réf. +20%",
          sub: "loyer présumé abusif au-delà de 20% du loyer de référence régional (renforcé mai 2025)",
        },
      ],
      platform: { to: "/rendement", label: "intégré à la ligne Fiscalité de la cascade Rendement" },
    },
    {
      title: "Céder",
      eyebrow: "À la sortie",
      rows: [
        {
          label: "Plus-value en société",
          value: pctFR(ISOC_PCT, 0),
          sub: "résultat de cession imposé à l'impôt des sociétés",
        },
        {
          label: "Cession via share deal",
          value: "usuelle",
          sub: "l'institutionnel cède souvent les parts de la société, pas l'immeuble",
        },
        {
          label: "Exit tax SIR/GVV",
          value: "selon régime",
          sub: "si le véhicule est une société immobilière réglementée",
        },
      ],
      platform: { to: "/arbitrage", label: "intégré aux frictions de sortie d'Arbitrage (et à la marge nette de Promotion)" },
    },
  ];
}

export const PAGE = {
  marketLine:
    "Région de Bruxelles-Capitale : ce que le fisc prend à chaque étape pour un investisseur institutionnel, et comment c'est déjà intégré dans nos verdicts.",
  chipPrefix: "Bruxelles",
  intro:
    "Acquérir, détenir, céder : les prélèvements bruxellois pour un véhicule société (pas primo-acquéreur), aux taux réels 2025, et l'endroit exact où chacun est déjà compté dans les cascades de la plateforme.",
  bannerEyebrowPrefix: "Poids fiscal du cycle",
  entryMaxLabel: "Frais d'entrée max",
  entryMaxSub: "droits + notaire",
  checkpointsTitle: (residential: boolean) =>
    `Points de contrôle · ${residential ? "existant (société)" : "commercial (société)"}`,
  checkpointsSub: "Droits d'enregistrement 12,5% pleine base plus notaire et frais ; chaque ligne est vérifiable sur le régime bruxellois.",
  checkpointCols: ["Prix d'acquisition", "Droits d'enregistrement", "Notaire + frais", "Total entrée", "% du prix"],
  baremeNote:
    "Bruxelles, existant : droits d'enregistrement 12,5% sur pleine base (abattement de 200 000 € réservé aux personnes physiques en résidence principale, non applicable à un fonds) ; neuf assujetti à la TVA 21% sans droits ; terrain à bâtir 12,5%. Repère : Wallonie 3% et Flandre 2% pour l'habitation propre et unique, Bruxelles la plus chère à l'entrée.",
  simulatorCaption:
    "Frais d'entrée bruxellois : droits d'enregistrement 12,5% plus notaire, soit un ordre de 14 à 15% du prix.",
  sources:
    "Régime bruxellois 2025 : droits d'enregistrement 12,5% (Région de Bruxelles-Capitale), TVA construction neuve 21%, précompte immobilier régional, impôt des sociétés 25%. Repères Wallonie 3% et Flandre 2% (habitation propre et unique).",
};

// Vérification structurelle : ce module satisfait le contrat RegimeFiscal.
export const __regimeCheck: RegimeFiscal = {
  fiscalInsight, entryMaxPct, acquisitionTaxes, volets, CHECKPOINTS, eurFR, pctFR, PAGE,
};
