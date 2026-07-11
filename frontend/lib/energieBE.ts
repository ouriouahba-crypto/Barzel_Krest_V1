// Régime énergie belge, Région de Bruxelles-Capitale (PEB). Page Énergie de
// Bruxelles. Faits réels : échelle PEB A à G ; objectif PEB 275 kWh/m²/an
// (classe E) au 1er janvier 2033, classes F et G non admises ; objectif PEB 150
// (classe C) vers 2045, cible les classes D-E ; certificat PEB généralisé à tous
// les bâtiments en 2028 ; interdiction des chaudières au mazout depuis le
// 1er juin 2025 ; cadre : Ordonnance du 7 mars 2024, stratégie Renolution.
// Bureaux de plus de 500 m² : certificat PEB tertiaire spécifique. Encadrement
// des loyers renforcé (mai 2025).
//
// Implémente RegimeEnergie (lib/regimes) : mêmes composants de page que le
// régime PT, contenu belge. Répartition du parc par commune SIMULÉE réaliste
// (gradient âge du bâti bruxellois, dense/ancien central plus exposé), à
// remplacer par les certificats PEB réels des actifs KREST. Le simulateur de
// rénovation interactif (curseur) est un lot 2b-ii distinct.

import type { RegimeEnergie, ParcRow } from "./regimes";
import { median } from "./scoring";
import { translate, type Lang } from "./i18n";
import { classLabelFor } from "./i18n/domain";

// Répartition PEB simulée par commune (%): ab = classes A-C, cd = classes D-E,
// ef = classes F-G (pire seau, interdit dès 2033 / se décote). Somme 100.
// Gradient âge du bâti : central/dense ancien plus exposé, résidentiel récent
// et sud-est aéré moins exposé. Estimation Barzel (aucun multiple systématique).
export const PARC_PEB: Record<string, ParcRow> = {
  saintjossetennoode: { ab: 14, cd: 52, ef: 34 },   // dense, bâti ancien
  molenbeeksaintjean: { ab: 16, cd: 52, ef: 32 },
  schaerbeek: { ab: 17, cd: 52, ef: 31 },
  anderlecht: { ab: 18, cd: 52, ef: 30 },
  koekelberg: { ab: 18, cd: 53, ef: 29 },
  saintgilles: { ab: 20, cd: 52, ef: 28 },
  bxlville: { ab: 21, cd: 52, ef: 27 },             // cœur historique
  forest: { ab: 22, cd: 52, ef: 26 },
  etterbeek: { ab: 23, cd: 52, ef: 25 },
  ganshoren: { ab: 22, cd: 54, ef: 24 },
  ixelles: { ab: 25, cd: 52, ef: 23 },
  jette: { ab: 24, cd: 54, ef: 22 },
  berchemsainteagathe: { ab: 24, cd: 55, ef: 21 },
  evere: { ab: 25, cd: 55, ef: 20 },
  woluwesaintlambert: { ab: 27, cd: 54, ef: 19 },
  watermaelboitsfort: { ab: 28, cd: 54, ef: 18 },   // aéré, verdoyant
  auderghem: { ab: 29, cd: 54, ef: 17 },
  uccle: { ab: 30, cd: 54, ef: 16 },
  woluwe: { ab: 32, cd: 53, ef: 15 },               // parc plus récent / villas
};

// Le parc tertiaire est plus récent que le résidentiel : décalage multiplicatif
// sur la part F-G, reporté sur la tranche D-E. Simulé, comme le reste du parc.
const CLASS_EF_SHIFT: Record<string, number> = {
  residential: 1.0,
  office: 0.85,
  hotel: 0.7,
  logistics: 0.9,
  retail: 0.95,
};

// Parc V0 déterministe (hash) pour une commune sans répartition curée : bornes
// du parc bruxellois. Remplacé en 2b par des certificats PEB réels.
function parcV0(zone: string): ParcRow {
  let h = 2166136261;
  for (let i = 0; i < zone.length; i++) {
    h = Math.imul(h ^ zone.charCodeAt(i), 16777619) >>> 0;
  }
  const ef = 16 + (h % 18);          // 16-33
  const ab = 16 + ((h >> 5) % 16);   // 16-31
  return { ab, cd: 100 - ab - ef, ef };
}

export function parcFor(zone: string, cls: string): ParcRow | null {
  const base = PARC_PEB[zone] ?? parcV0(zone);
  const k = CLASS_EF_SHIFT[cls] ?? 1.0;
  const ef = Math.round(base.ef * k);
  return { ab: base.ab, cd: 100 - base.ab - ef, ef };
}

// Risque PEB par commune : le pilier énergie du moteur (risque pays /100) modulé
// par l'exposition du parc (part F-G). Affichage seulement (aucun score touché).
export function riskMeps(engineRisk: number, ef: number, efMax: number): number {
  return Math.round(engineRisk * (0.5 + 0.5 * (ef / Math.max(1, efMax))));
}
// Verdict PEB : SEUILS et tone inchangés ; `label` est une CLÉ i18n PARTAGÉE
// avec le régime PT (même vocabulaire de verdict), résolue par la page via t().
export function energyVerdict(risk: number): { label: string; tone: "good" | "mid" | "low" } {
  if (risk >= 32) return { label: "nrgx.verdict.exposed", tone: "low" };
  if (risk >= 27) return { label: "nrgx.verdict.watch", tone: "mid" };
  return { label: "nrgx.verdict.contained", tone: "good" };
}

// Phrase déterministe par classe sur l'exposition du parc. Le CALCUL (médiane
// des parts F-G, arrondi) est inchangé ; seule la prose sort du module.
export function energieInsight(
  cls: string,
  zones: string[],
  cityName = "Bruxelles",
  lang: Lang = "fr",
): string {
  const efs = zones
    .map((z) => parcFor(z, cls)?.ef)
    .filter((v): v is number => v != null);
  const x = median(efs);
  if (x == null) return translate("nrgx.be.insight.loading", lang);
  if (cls === "residential") {
    return translate("nrgx.be.insight.residential", lang, { x: Math.round(x), city: cityName });
  }
  return translate("nrgx.be.insight.commercial", lang, {
    x: Math.round(x),
    city: cityName,
    cls: classLabelFor(cls, lang).toLowerCase(),
  });
}

// Jalons réglementaires vérifiés (Ordonnance PEB bruxelloise, Renolution).
// `when`/`what` = CLÉS i18n (cf. régime PT) ; ordre et nombre d'entrées portés
// par le module.
export const TIMELINE: { when: string; what: string }[] = [
  { when: "nrgx.be.tl.0.when", what: "nrgx.be.tl.0.what" },
  { when: "nrgx.be.tl.1.when", what: "nrgx.be.tl.1.what" },
  { when: "nrgx.be.tl.2.when", what: "nrgx.be.tl.2.what" },
  { when: "nrgx.be.tl.3.when", what: "nrgx.be.tl.3.what" },
  { when: "nrgx.be.tl.4.when", what: "nrgx.be.tl.4.what" },
];

// Textes de page du régime BE : CLÉS i18n (résolues par la page via t()), sauf
// les DONNÉES `chipPrefix` (sigle) et `platform.to` (route).
export const PAGE = {
  marketLine: "nrgx.be.page.marketLine",
  chipPrefix: "PEB",
  intro: "nrgx.be.page.intro",
  bannerEyebrowPrefix: "nrgx.be.page.bannerEyebrowPrefix",
  maxLabelPrefix: "nrgx.be.page.maxLabelPrefix",
  maxSub: "nrgx.be.page.maxSub",
  timelineTitle: "nrgx.be.page.timelineTitle",
  timelineSub: "nrgx.be.page.timelineSub",
  platform: { to: "/rendement", label: "nrgx.be.page.platform" },
  simulatorCaption: "nrgx.be.page.simulatorCaption",
  tableCols: [
    "nrgx.be.page.col.zone",
    "nrgx.be.page.col.ab",
    "nrgx.be.page.col.cd",
    "nrgx.be.page.col.ef",
    "nrgx.be.page.col.risk",
    "nrgx.be.page.col.verdict",
  ],
  sources: "nrgx.be.page.sources",
};

// Vérification structurelle : ce module satisfait le contrat RegimeEnergie.
export const __regimeCheck: RegimeEnergie = {
  parcFor, riskMeps, energyVerdict, energieInsight, TIMELINE, PAGE,
};
