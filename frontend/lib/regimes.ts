// Interfaces de régime Fiscalité / Énergie, city-driven (même mécanisme que le
// zone_noun de 2a) : les pages Fiscalité et Énergie consomment `city.fiscal` /
// `city.energie` via ces contrats. Le régime PT (lib/fiscal, lib/energie) et le
// régime BE (lib/fiscalBE, lib/energieBE) les satisfont tous les deux ; la page
// ne connaît pas le pays. Capturent EXACTEMENT ce que les pages consomment
// (les modules exposent des surensembles, assignables structurellement).

import type { PmRow } from "./priceMargin";
import type { RdRow } from "./rendement";

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
  simulatorCaption: string;
  sources: string;
}
export interface RegimeFiscal {
  fiscalInsight: (cls: string, pm: PmRow[], rd: RdRow[], cityName?: string) => string;
  entryMaxPct: (residential: boolean) => number;
  acquisitionTaxes: (price: number, residential: boolean) => { imt: number; selo: number; total: number; pct: number };
  volets: () => FiscalVolet[];
  CHECKPOINTS: number[];
  eurFR: (v: number) => string;
  pctFR: (v: number, d?: number) => string;
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
export interface RegimeEnergie {
  parcFor: (zone: string, cls: string) => ParcRow | null;
  riskMeps: (engineRisk: number, ef: number, efMax: number) => number;
  energyVerdict: (risk: number) => { label: string; tone: "good" | "mid" | "low" };
  energieInsight: (cls: string, zones: string[], cityName?: string) => string;
  TIMELINE: { when: string; what: string }[];
  PAGE: EnergiePage;
}
