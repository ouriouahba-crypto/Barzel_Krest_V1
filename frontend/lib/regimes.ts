// Interfaces de régime Fiscalité / Énergie, city-driven (même mécanisme que le
// zone_noun de 2a) : les pages Fiscalité et Énergie consomment `city.fiscal` /
// `city.energie` via ces contrats. Le régime PT (lib/fiscal, lib/energie) et le
// régime BE (lib/fiscalBE, lib/energieBE) les satisfont tous les deux ; la page
// ne connaît pas le pays. Capturent EXACTEMENT ce que les pages consomment
// (les modules exposent des surensembles, assignables structurellement).

import type { PmRow } from "./priceMargin";
import type { RdRow } from "./rendement";
import type { Lang } from "./i18n/types";

// ---- Fiscalité -------------------------------------------------------------
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
// Champs de prose/libellé de FiscalPage : ce sont des CLÉS i18n, résolues par la
// page via t() (lot i18n-fiscal). `chipPrefix` fait exception : c'est une donnée
// (nom de pays/ville, non traduit). `baremeParams` porte les tokens de
// `baremeNote` quand le régime en a (PT : nombre de tranches du barème IMT).
export interface FiscalPage {
  marketLine: string;
  chipPrefix: string;
  intro: string;
  bannerEyebrowPrefix: string;
  entryMaxLabel: string;
  entryMaxSub: string;
  checkpointsTitle: (residential: boolean) => string;
  checkpointsSub: string;
  checkpointCols: string[];
  baremeNote: string;
  baremeParams?: Record<string, string | number>;
  simulatorCaption: string;
  sources: string;
}
export interface RegimeFiscal {
  fiscalInsight: (cls: string, pm: PmRow[], rd: RdRow[], cityName: string, lang: Lang) => string;
  entryMaxPct: (residential: boolean) => number;
  acquisitionTaxes: (price: number, residential: boolean) => { imt: number; selo: number; total: number; pct: number };
  volets: (lang: Lang) => FiscalVolet[];
  CHECKPOINTS: number[];
  // Formateurs de barème : milliers ET décimale localisés (lot i18n-numbers-1).
  eurFR: (v: number, lang: Lang) => string;
  pctFR: (v: number, lang: Lang, d?: number) => string;
  PAGE: FiscalPage;
}

// ---- Énergie ---------------------------------------------------------------
// ParcRow : 3 seaux de classes énergétiques. En PT (SCE A+ à F) : ab = A+-B,
// cd = C-D, ef = E-F. En BE (PEB A à G) : ab = A-C, cd = D-E, ef = F-G (pire
// seau, interdit dès 2033). L'interface est neutre, la page rend les libellés
// de seau via PAGE.tableCols.
export interface ParcRow {
  ab: number;
  cd: number;
  ef: number;
}
// Champs de prose/libellé d'EnergiePage : ce sont des CLÉS i18n, résolues par la
// page via t() (lot i18n-energie), `tableCols` incluse. `chipPrefix` fait
// exception : c'est une donnée (sigle réglementaire EPBD/PEB, non traduit), tout
// comme `platform.to` (route).
export interface EnergiePage {
  marketLine: string;
  chipPrefix: string;
  intro: string;
  bannerEyebrowPrefix: string;
  maxLabelPrefix: string;
  maxSub: string;
  timelineTitle: string;
  timelineSub: string;
  platform: { to: string; label: string };
  simulatorCaption: string;
  tableCols: string[];
  sources: string;
}
// `energyVerdict.label` et les champs de TIMELINE sont eux aussi des CLÉS i18n
// (verdicts : clés PARTAGÉES entre régimes) ; seuils et tone restent moteur.
export interface RegimeEnergie {
  parcFor: (zone: string, cls: string) => ParcRow | null;
  riskMeps: (engineRisk: number, ef: number, efMax: number) => number;
  energyVerdict: (risk: number) => { label: string; tone: "good" | "mid" | "low" };
  energieInsight: (cls: string, zones: string[], cityName: string, lang: Lang) => string;
  TIMELINE: { when: string; what: string }[];
  PAGE: EnergiePage;
}
