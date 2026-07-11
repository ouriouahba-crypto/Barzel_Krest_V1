// Page Énergie : faits réglementaires vérifiés (EPBD 2024/1275, SCE portugais
// DL 101-D/2020 : échelle A+ → F, F = pire classe (il n'y a PAS de classe G au
// Portugal) + données de parc par freguesia SIMULÉES réalistes (part des
// classes basses plus élevée dans le bâti ancien : centre historique haut,
// neuf littoral/périurbain bas). À remplacer par les certificats énergétiques
// réels des actifs KREST.

import { RdRow } from "./rendement";
import { median } from "./scoring";
import { translate, type Lang } from "./i18n";
import { classLabelFor } from "./i18n/domain";

// Répartition simulée du parc résidentiel par classes SCE (A+-B / C-D / E-F),
// en % : somme 100, gradient âge du bâti (aucun multiple de 5 systématique).
export interface ParcRow {
  ab: number;   // A+ à B
  cd: number;   // C à D
  ef: number;   // E à F (« sous la classe D »)
}
export const PARC_SCE: Record<string, ParcRow> = {
  santamarinhaesaopedrodaafurada: { ab: 14, cd: 48, ef: 38 }, // centre historique
  oliveiradodouro: { ab: 18, cd: 52, ef: 30 },
  mafamudeevilardoparaiso: { ab: 22, cd: 50, ef: 28 },
  avintes: { ab: 20, cd: 54, ef: 26 },
  grijoesermonde: { ab: 18, cd: 56, ef: 26 },
  "sandim,olival,leverecrestuma": { ab: 16, cd: 58, ef: 26 }, // rural ancien
  serzedoeperosinho: { ab: 19, cd: 56, ef: 25 },
  pedrosoeseixezelo: { ab: 21, cd: 55, ef: 24 },
  saofelixdamarinha: { ab: 24, cd: 52, ef: 24 },
  arcozelo: { ab: 26, cd: 52, ef: 22 },
  gulpilharesevaladares: { ab: 28, cd: 51, ef: 21 },
  canelas: { ab: 27, cd: 54, ef: 19 },
  madalena: { ab: 33, cd: 49, ef: 18 },
  vilardeandorinho: { ab: 30, cd: 54, ef: 16 },              // périurbain récent
  canidelo: { ab: 36, cd: 50, ef: 14 },                      // neuf littoral
  // Lisbonne (lot 2b) : parc curé par âge du bâti. Centre historique 45-55%
  // E-F, Parque das Nações A/B dominants, périphéries C-D dominantes.
  santamariamaior: { ab: 8, cd: 40, ef: 52 },   // Alfama/Baixa, bâti ancien
  misericordia: { ab: 9, cd: 42, ef: 49 },      // Bairro Alto/Chiado
  saovicente: { ab: 10, cd: 43, ef: 47 },
  ajuda: { ab: 11, cd: 43, ef: 46 },            // parc ancien dégradé
  estrela: { ab: 16, cd: 46, ef: 38 },
  beato: { ab: 17, cd: 46, ef: 37 },            // industriel ancien en mutation
  santoantonio: { ab: 18, cd: 46, ef: 36 },
  penhadefranca: { ab: 17, cd: 49, ef: 34 },
  marvila: { ab: 19, cd: 48, ef: 33 },
  campodeourique: { ab: 19, cd: 49, ef: 32 },
  alcantara: { ab: 21, cd: 48, ef: 31 },
  avenidasnovas: { ab: 23, cd: 47, ef: 30 },
  arroios: { ab: 22, cd: 49, ef: 29 },
  belem: { ab: 24, cd: 48, ef: 28 },
  campolide: { ab: 24, cd: 49, ef: 27 },
  alvalade: { ab: 27, cd: 47, ef: 26 },
  areeiro: { ab: 26, cd: 49, ef: 25 },
  saodomingosdebenfica: { ab: 28, cd: 48, ef: 24 },
  olivais: { ab: 29, cd: 48, ef: 23 },
  benfica: { ab: 30, cd: 48, ef: 22 },
  carnide: { ab: 31, cd: 48, ef: 21 },
  santaclara: { ab: 28, cd: 52, ef: 20 },
  lumiar: { ab: 34, cd: 48, ef: 18 },           // Alta de Lisboa, parc récent
  parquedasnacoes: { ab: 64, cd: 30, ef: 6 },   // Expo 98, A/B dominants
};

// Le parc tertiaire diffère du résidentiel : décalage multiplicatif sur la part
// E-F (bureaux/hôtels plus récents, logistique proche du résidentiel), reporté
// sur la tranche C-D. Simulé, comme le reste du parc.
const CLASS_EF_SHIFT: Record<string, number> = {
  residential: 1.0,
  office: 0.85,
  hotel: 0.7,
  logistics: 0.9,
  retail: 0.95,
};

export function parcFor(zone: string, cls: string): ParcRow | null {
  const base = PARC_SCE[zone] ?? parcV0(zone);
  if (!base) return null;
  const k = CLASS_EF_SHIFT[cls] ?? 1.0;
  const ef = Math.round(base.ef * k);
  return { ab: base.ab, cd: 100 - base.ab - ef, ef };
}

// Parc V0 déterministe (hash du zone id) pour les villes sans répartition SCE
// curée (Lisbonne, lot 2a) : ef 15-36, ab 14-33, bornes du parc Gaia. Remplacé
// en 2b par des données réelles (ADENE / certificats).
function parcV0(zone: string): ParcRow {
  let h = 2166136261;
  for (let i = 0; i < zone.length; i++) {
    h = Math.imul(h ^ zone.charCodeAt(i), 16777619) >>> 0;
  }
  const ef = 15 + (h % 22);
  const ab = 14 + ((h >> 5) % 20);
  return { ab, cd: 100 - ab - ef, ef };
}

// Risque MEPS par freguesia : le pilier énergie du moteur (risque pays, natif
// /100) modulé par l'exposition du parc : plus de classes basses, plus de
// risque de mise à niveau forcée.
export function riskMeps(engineRisk: number, ef: number, efMax: number): number {
  return Math.round(engineRisk * (0.5 + 0.5 * (ef / Math.max(1, efMax))));
}
// Verdict énergie : SEUILS et tone inchangés ; `label` est une CLÉ i18n PARTAGÉE
// avec le régime BE (le vocabulaire de verdict ne dépend pas du pays), résolue
// par la page via t().
export function energyVerdict(risk: number): { label: string; tone: "good" | "mid" | "low" } {
  if (risk >= 32) return { label: "nrgx.verdict.exposed", tone: "low" };
  if (risk >= 27) return { label: "nrgx.verdict.watch", tone: "mid" };
  return { label: "nrgx.verdict.contained", tone: "good" };
}

// ---------------------------------------------------------------------------
// Simulateur de mise à niveau : coûts de rénovation énergétique PT, ordres de
// grandeur ADENE/marché 2026 (ETICS 30-80 €/m² de façade, toiture 20-60 €/m²,
// menuiseries ~2 k€/logement, PAC 6-7,5 k€) ramenés au m² habitable, par saut
// de classe SCE.
// ---------------------------------------------------------------------------
export const SCE_SCALE = ["F", "E", "D", "C", "B"] as const;
export type SceGrade = (typeof SCE_SCALE)[number];

// € / m² habitable par saut de classe (cumulatifs le long de l'échelle).
const STEP_CAPEX: Record<string, number> = {
  "F→E": 70,   // isolation toiture + étanchéité
  "E→D": 80,   // ETICS partiel
  "D→C": 120,  // menuiseries complètes + PAC AQS
  "C→B": 180,  // PAC chauffage + solaire
};

export function capexPerM2(from: SceGrade, to: SceGrade): number | null {
  const i = SCE_SCALE.indexOf(from);
  const j = SCE_SCALE.indexOf(to);
  if (i < 0 || j <= i) return null;
  let total = 0;
  for (let k = i; k < j; k++) {
    total += STEP_CAPEX[`${SCE_SCALE[k]}→${SCE_SCALE[k + 1]}`] ?? 0;
  }
  return total;
}

// Impact sur le yield net d'un actif type de la freguesia (ligne détention du
// moteur) : CAPEX ajouté à la base de valeur, loyer inchangé.
// Base économique du calcul = valeur implicite loyer / rendement brut (le
// rendement net « avant » reste EXACTEMENT celui de la page Rendement, pas de
// dérive inter-page). La valeur AFFICHÉE « actif type » (médiane de marché de la
// freguesia) est un libellé, gérée côté composant : voir RetrofitSimulator.
export function retrofitImpact(row: RdRow, capex: number) {
  if (!row.loyer || row.yieldBrut <= 0) return null;
  const value = row.loyer / (row.yieldBrut / 100);          // valeur type €/m²
  const factor = 1 - (row.chargesPctLoyer + row.fiscPctLoyer) / 100;
  const brutAfter = (row.loyer / (value + capex)) * 100;
  const netAfter = brutAfter * factor;
  return { value, netBefore: row.yieldNet, netAfter, compression: row.yieldNet - netAfter };
}

// Phrase déterministe par classe sur l'exposition du parc. Le CALCUL (médiane
// des parts E-F, arrondi) est inchangé ; seule la prose sort du module (clés
// i18n, traducteur non-hook).
export function energieInsight(
  cls: string,
  zones: string[],
  cityName: string = "Gaia",
  lang: Lang = "fr",
): string {
  const efs = zones
    .map((z) => parcFor(z, cls)?.ef)
    .filter((v): v is number => v != null);
  const x = median(efs);
  if (x == null) return translate("nrgx.pt.insight.loading", lang);
  if (cls === "residential") {
    // « compté », pas « pénalisé sur le centre historique » : selon la ville, le
    // parc ancien central n'est pas forcément Céder en détention (à Porto,
    // Cedofeita, centre historique, est la seule Conserver). Ce qui est vrai
    // partout : le risque MEPS pèse sur le parc le plus ancien et alimente le
    // pilier énergie des verdicts de détention.
    return translate("nrgx.pt.insight.residential", lang, { x: Math.round(x), city: cityName });
  }
  return translate("nrgx.pt.insight.commercial", lang, {
    x: Math.round(x),
    city: cityName,
    cls: classLabelFor(cls, lang).toLowerCase(),
  });
}

// --------------------------------------------------------------------------- #
// Contenu de page du régime énergie PT (page Énergie). Un régime BE (PEB…)     #
// exposera la même interface (PAGE, TIMELINE…) : la page ne change pas.        #
// --------------------------------------------------------------------------- #

// Jalons réglementaires vérifiés (EPBD (UE) 2024/1275 ; SCE DL 101-D/2020).
// `when` et `what` sont des CLÉS i18n (la date elle-même se dit dans la langue :
// « 28 mai 2024 » / « 28 May 2024 ») ; la page les résout via t(). Ordre et
// nombre d'entrées portés par le module, comme avant.
export const TIMELINE: { when: string; what: string }[] = [
  { when: "nrgx.pt.tl.0.when", what: "nrgx.pt.tl.0.what" },
  { when: "nrgx.pt.tl.1.when", what: "nrgx.pt.tl.1.what" },
  { when: "nrgx.pt.tl.2.when", what: "nrgx.pt.tl.2.what" },
  { when: "nrgx.pt.tl.3.when", what: "nrgx.pt.tl.3.what" },
  { when: "nrgx.pt.tl.4.when", what: "nrgx.pt.tl.4.what" },
  { when: "nrgx.pt.tl.5.when", what: "nrgx.pt.tl.5.what" },
  { when: "nrgx.pt.tl.6.when", what: "nrgx.pt.tl.6.what" },
];

// Textes de page du régime PT : tous les champs de prose/libellé sont des CLÉS
// i18n, résolues par la page via t() (lot i18n-energie). Font exception les
// DONNÉES : `chipPrefix` (sigle réglementaire, non traduit), `platform.to`
// (route) et `defaultZone` (id de zone).
// `marketLine`/`intro` restent NEUTRES (aucun nom de ville) : ce repli commun ne
// doit fuir l'identité éditoriale d'aucune ville. Chaque ville PT porte son
// propre libellé dans le registre (`texts.energieMarketLine` /
// `texts.energieIntro`, cf. lib/cities.ts) ; ces valeurs génériques ne servent
// que de dernier recours.
export const PAGE = {
  marketLine: "nrgx.pt.page.marketLine",
  chipPrefix: "EPBD",
  intro: "nrgx.pt.page.intro",
  bannerEyebrowPrefix: "nrgx.pt.page.bannerEyebrowPrefix",
  maxLabelPrefix: "nrgx.pt.page.maxLabelPrefix",
  maxSub: "nrgx.pt.page.maxSub",
  timelineTitle: "nrgx.pt.page.timelineTitle",
  timelineSub: "nrgx.pt.page.timelineSub",
  platform: { to: "/rendement", label: "nrgx.pt.page.platform" },
  simulatorCaption: "nrgx.pt.page.simulatorCaption",
  tableCols: [
    "nrgx.pt.page.col.zone",
    "nrgx.pt.page.col.ab",
    "nrgx.pt.page.col.cd",
    "nrgx.pt.page.col.ef",
    "nrgx.pt.page.col.risk",
    "nrgx.pt.page.col.verdict",
  ],
  sources: "nrgx.pt.page.sources",
  // Freguesia par défaut du simulateur (actif type) quand rien n'est sélectionné.
  defaultZone: "santamarinhaesaopedrodaafurada",
};
