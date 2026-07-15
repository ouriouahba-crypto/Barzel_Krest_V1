// Scoring presentation config + the client-side margin formula for the Haya
// slider. These mirror the backend params (verdict ladders, marge band) so the
// live recompute matches the API exactly.

export type Mode = "promotion" | "detention" | "arbitrage" | "landbank";

export const MODES: Mode[] = ["promotion", "detention", "arbitrage", "landbank"];

export const MODE_LABEL: Record<Mode, string> = {
  promotion: "Promotion",
  detention: "Détention",
  arbitrage: "Arbitrage",
  landbank: "Landbank",
};

export const ASSET_CLASSES = [
  { value: "residential", label: "Résidentiel" },
  { value: "office", label: "Bureaux" },
  { value: "hotel", label: "Hôtellerie" },
  { value: "logistics", label: "Logistique" },
  { value: "retail", label: "Commerce" },
];

export function classLabel(value: string): string {
  return ASSET_CLASSES.find((c) => c.value === value)?.label || value;
}

export const SIDEBAR_MODULES = [
  "Vue d'ensemble",
  "Carte",
  "Comparer",
  "Prix & marge",
  "Rendement",
  "Arbitrage",
  "Foncier",
  "Fiscalité",
  "Énergie",
];

// ---- Sequential scale: muted red -> cream/gold -> deep green, on the charte -
const RED = [158, 91, 91]; // #9E5B5B
const GOLD = [201, 168, 106]; // #C9A86A (cream/or mid)
const GREEN = [47, 107, 61]; // #2F6B3D (deep green, high)

function lerp(a: number[], b: number[], t: number) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

export function scoreColor(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "#9AA7B4";
  const t = Math.max(0, Math.min(1, score / 100));
  const rgb = t < 0.5 ? lerp(RED, GOLD, t / 0.5) : lerp(GOLD, GREEN, (t - 0.5) / 0.5);
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

// Verdict badge tone by mode + label
export function verdictTone(mode: Mode, verdict: string): "good" | "mid" | "low" {
  const good = ["Go", "Conserver", "Fenetre ouverte", "Fenêtre ouverte", "Prioritaire"];
  const mid = ["Conditionnel", "Surveiller", "Fenetre etroite", "Fenêtre étroite", "A phaser", "À phaser"];
  if (good.includes(verdict)) return "good";
  if (mid.includes(verdict)) return "mid";
  return "low";
}

// Display-only accent mapping. Backend verdict strings stay ASCII (unchanged) and
// remain the keys for verdictTone / verdictColor / comparisons; only the rendered
// text is accented.
const VERDICT_LABEL: Record<string, string> = {
  "Fenetre ouverte": "Fenêtre ouverte",
  "Fenetre etroite": "Fenêtre étroite",
  "Fenetre fermee": "Fenêtre fermée",
  Ceder: "Céder",
  "A phaser": "À phaser",
};
export function verdictLabel(verdict: string): string {
  return VERDICT_LABEL[verdict] ?? verdict;
}

// Solid charte colour for a verdict (chart bars, accents); matches the score ramp.
const VERDICT_COLOR: Record<"good" | "mid" | "low", string> = {
  good: "#2F6B3D", // deep green
  mid: "#C9A86A",  // gold
  low: "#9E5B5B",  // muted red
};
export function verdictColor(mode: Mode, verdict: string): string {
  return VERDICT_COLOR[verdictTone(mode, verdict)];
}
// Encres de verdict pour du TEXTE sur fond clair (AA ≥ 4.5:1 sur blanc et cream) :
// seul le mid diffère (or brut 2.26:1 → gold.700 #85683A). Barres, liserés et
// badges gardent VERDICT_COLOR.
const VERDICT_TEXT_COLOR: Record<"good" | "mid" | "low", string> = {
  good: "#2F6B3D",
  mid: "#85683A",
  low: "#9E5B5B",
};
export function verdictTextColor(mode: Mode, verdict: string): string {
  return VERDICT_TEXT_COLOR[verdictTone(mode, verdict)];
}
// Rampe de score pour du TEXTE sur fond clair : mêmes bornes rouge/vert (déjà
// AA) mais pivot or assombri (#85683A), miroir texte de scoreColor.
const GOLD_TEXT = [133, 104, 58]; // #85683A
export function scoreTextColor(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "#3D4C5F";
  const t = Math.max(0, Math.min(1, score / 100));
  const rgb = t < 0.5 ? lerp(RED, GOLD_TEXT, t / 0.5) : lerp(GOLD_TEXT, GREEN, (t - 0.5) / 0.5);
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}
// Rampe de score pour du TEXTE sur fond NAVY (tuiles K-REST) : rouge/vert
// éclaircis (le vert profond tombe à 2.5:1 sur navy), pivot or inchangé (8:1).
const RED_DARKBG = [217, 148, 148]; // #D99494
const GREEN_DARKBG = [125, 184, 138]; // #7DB88A
export function scoreTextColorDark(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "#F8F5EE";
  const t = Math.max(0, Math.min(1, score / 100));
  const rgb = t < 0.5 ? lerp(RED_DARKBG, GOLD, t / 0.5) : lerp(GOLD, GREEN_DARKBG, (t - 0.5) / 0.5);
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

// ---------------------------------------------------------------------------
// Formatage numérique de plateforme : arrondi half-up au digit (le Math.round
// des scores, identique au _fmt_num du backend qui produit les labels natifs)
// et jamais de zéro négatif : toute valeur qui tombe à zéro après arrondi
// s'affiche « 0 », sans signe (« -0% » interdit partout).
// ---------------------------------------------------------------------------
export function roundHalfUp(v: number, digits = 0): number {
  const q = Math.pow(10, digits);
  const r = Math.round(v * q) / q;
  return r === 0 ? 0 : r; // -0 → 0
}
export function fmtNum(v: number, digits = 0): string {
  return roundHalfUp(v, digits).toFixed(digits);
}
// Variante signée : « + » sur le positif strict, jamais de zéro signé.
export function fmtSigned(v: number, digits = 0): string {
  const r = roundHalfUp(v, digits);
  return `${r > 0 ? "+" : ""}${r.toFixed(digits)}`;
}

export function median(vals: number[]): number | null {
  const a = vals.filter((v) => v != null && !Number.isNaN(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// numeric native value of a pillar (marge %, yield %, spread %, constructibilité…)
export function pillarValue(pillars: { pillar: string; native: { value: number | string | null }; applicable: boolean }[], key: string): number | null {
  const p = pillars.find((x) => x.pillar === key && x.applicable);
  const v = p?.native.value;
  return typeof v === "number" ? v : null;
}

// Routes of the shipped mode pages (Sidebar, overview cards, compare links).
export const MODE_ROUTE: Record<Mode, string> = {
  promotion: "/prix-marge",
  detention: "/rendement",
  arbitrage: "/arbitrage",
  landbank: "/foncier",
};

// The mode-specific key figure: which pillar + label/unit
export const MODE_KPI: Record<Mode, { pillar: string; label: string; unit: string; digits: number }> = {
  promotion: { pillar: "marge", label: "Marge médiane", unit: "%", digits: 0 },
  detention: { pillar: "rendement_net", label: "Yield net médian", unit: "%", digits: 1 },
  arbitrage: { pillar: "spread", label: "Spread médian", unit: "%", digits: 0 },
  landbank: { pillar: "constructibilite", label: "Constructibilité méd.", unit: "/100", digits: 0 },
};

// Displayed title for a pillar key. Default humanises the key; overrides give a
// clearer wording. "valeur_meilleur_usage" is the max multi-usage VALUATION, not
// the Foncier destination reco (which keeps "meilleur usage") : titled
// "valorisation max" to lift the client-visible term collision.
const PILLAR_TITLE: Record<string, string> = {
  valeur_meilleur_usage: "valorisation max",
};
export function pillarTitle(key: string): string {
  return PILLAR_TITLE[key] ?? key.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Haya : client-side margin recompute (formula identical to the backend).
// Portugal residential: no VAT on the sale. cost = 1.261 × (construction +
// foncier); marge = (prix de vente − coût) / coût. Trophy front-de-fleuve
// economics (construction 2065 NZEB, foncier 1300) → ~35.5% at the 5750 base.
// Only the sale price moves with the slider.
// ---------------------------------------------------------------------------
export const HAYA = {
  construction: 2065,
  foncier: 1300,
  freguesiaMedian: 2721,
  baseSale: 5750,
  saleMin: 3500,
  saleMax: 8000,
};

const COST_FACTOR = 1.261; // 1 + dev_cost_stack(0.18) + finance(LTV0.6×debt0.045×3y)

// ---------------------------------------------------------------------------
// Formoso : actif vedette lisboète (Marvila, reconversion d'un entrepôt viticole,
// 50 appartements T1 et T2 duplex, architecte Bak Gordon). L'identifiant interne
// reste FABRICA (asset key fabrica_oriente, route API asset=fabrica, composant
// FabricaSlider) : seul le libellé d'affichage change. Même équation moteur que
// Haya : coût = 1,261 × (construction + foncier), résidentiel PT sans TVA sur le
// prix de sortie (IMT côté acquéreur). Marge 20,5 % à 5 400 (affichée 21 %).
// ---------------------------------------------------------------------------
export const FABRICA = {
  construction: 2210, // coque conservée + finitions (reconversion)
  foncier: 1343,      // friche hors marché central
  freguesiaMedian: 5029,
  baseSale: 5400,
  saleMin: 4800,
  saleMax: 6200,
  surface: 14000,
};

export function fabricaCost() {
  return COST_FACTOR * (FABRICA.construction + FABRICA.foncier);
}

export function fabricaMargin(salePerM2: number): number {
  const cost = fabricaCost();
  return ((salePerM2 - cost) / cost) * 100;
}

export function fabricaPremium(salePerM2: number): number {
  return (salePerM2 / FABRICA.freguesiaMedian - 1) * 100;
}

export function hayaCost() {
  return COST_FACTOR * (HAYA.construction + HAYA.foncier);
}

export function hayaMargin(salePerM2: number): number {
  const cost = hayaCost();
  return ((salePerM2 - cost) / cost) * 100;
}

export function hayaPremium(salePerM2: number): number {
  return (salePerM2 / HAYA.freguesiaMedian - 1) * 100;
}

// ---------------------------------------------------------------------------
// Dansaert Quai : actif vedette bruxellois (Molenbeek, quartier du canal /
// Dansaert). Conversion d'un immeuble de bureaux vacant en résidentiel, coque
// conservée. Économie BE : TVA 21% assujettie sur le neuf (pas de droits
// d'enregistrement sur le neuf) -> le prix de sortie est net de TVA avant la
// marge ; coût = 1,261 × (conversion + foncier au prix bureau). Composant
// distinct (DansaertSlider), Haya/Formoso strictement intouchés.
// ---------------------------------------------------------------------------
export const DANSAERT = {
  construction: 1550, // conversion bureau vers résidentiel, coque conservée + finitions + mise à niveau PEB
  foncier: 780,       // acquisition de l'immeuble de bureaux vacant, au prix bureau
  communeMedian: 2740, // Molenbeek-Saint-Jean
  baseSale: 4080,      // Go confortable : marge ~15%, prime +49% (< +50%) sur la médiane commune
  saleMin: 3300,       // borne basse en Passer (marge négative)
  saleMax: 4600,       // borne haute en Go, marge saine ~29%
  surface: 13000,
  vatPct: 21,          // TVA neuf BE assujettie
  goMarginFloorPct: 12, // seuil de feu vert du DÉVELOPPEMENT (hurdle rate projet) : une
  //                      marge conventionnelle est requise pour engager la conversion, plus
  //                      exigeant que le cap de marché de la commune (8%). Calibration de la
  //                      couche actif, jamais des 19 communes.
};

export function dansaertCost() {
  return COST_FACTOR * (DANSAERT.construction + DANSAERT.foncier);
}

export function dansaertMargin(salePerM2: number): number {
  const cost = dansaertCost();
  const net = salePerM2 / (1 + DANSAERT.vatPct / 100); // net de TVA 21%
  return ((net - cost) / cost) * 100;
}

export function dansaertPremium(salePerM2: number): number {
  return (salePerM2 / DANSAERT.communeMedian - 1) * 100;
}

// ---------------------------------------------------------------------------
// Campanha Souto de Moura : actif vedette porto (Campanha, arc de regeneration
// est). Projet mixte (logement, appart-hotel, bureaux, commerces) signe Eduardo
// Souto de Moura avec Metro Urbe, a 300 m de la gare de Campanha ; vedette ancree
// sur sa composante RESIDENTIELLE, positionnement accessible (recale sur donnees
// publiques KREST : foncier acquis ~15 M eur / ~70 000 m2 = ~215 eur/m2). Meme
// modele de cout que Haya/Fabrica : cout = 1,261 × (construction + foncier) ;
// residentiel PT SANS TVA sur le prix de sortie (IMT cote acquereur). La marge de
// la vedette est une marge sur le prix de sortie (profit sur GDV : (prix - cout)/
// prix), coherente avec le positionnement accessible et avec le backend (flag
// margin_basis "gdv" de l'actif). Composant distinct (CampanhaSlider) ; Haya/
// Fabrica/Dansaert strictement intouches. Feu vert du developpement a marge
// conventionnelle (hurdle rate projet 12%, plus exigeant que le cap de marche 8%).
// ---------------------------------------------------------------------------
export const CAMPANHA = {
  construction: 1800, // rehabilitation/developpement mixte a composante residentielle (recale)
  foncier: 215,       // foncier acquis ~15 M eur / ~70 000 m2 constructibles = ~215 eur/m2
  freguesiaMedian: 2857, // Campanha (INE)
  baseSale: 3000,     // Go confortable : marge sur GDV ~15%, prime +5% (positionnement accessible)
  saleMin: 2500,      // borne basse en Passer (marge negative)
  saleMax: 3600,      // borne haute en Go, marge ~29%
  surface: 22000,     // composante residentielle simulee (interne, non affichee) du projet mixte 70 000+ m²
  goMarginFloorPct: 12, // hurdle rate projet : bascule Conditionnel -> Go a ~12% de marge,
  //                       plus exigeant que le cap de marche 8% de la commune. Calibration de
  //                       la couche actif, jamais des 7 freguesias.
};

export function campanhaCost() {
  return COST_FACTOR * (CAMPANHA.construction + CAMPANHA.foncier);
}

export function campanhaMargin(salePerM2: number): number {
  // Marge sur le prix de sortie (profit sur GDV), positionnement accessible ;
  // PT residentiel : pas de TVA deduite du prix de sortie. Miroir du backend
  // (flag margin_basis "gdv" de l'actif campanha_souto).
  const cost = campanhaCost();
  return ((salePerM2 - cost) / salePerM2) * 100;
}

export function campanhaPremium(salePerM2: number): number {
  return (salePerM2 / CAMPANHA.freguesiaMedian - 1) * 100;
}

// Piecewise-linear band -> 0-100 subscore (mirrors the backend _band()).
function bandSubscore(pts: [number, number][], v: number): number {
  if (v <= pts[0][0]) return pts[0][1];
  if (v >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, s0] = pts[i];
    const [x1, s1] = pts[i + 1];
    if (v >= x0 && v <= x1) {
      return s0 + ((s1 - s0) * (v - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

// marge_pct band (mirrors params bands: faible 10 / correct 18 / bon 25)
const MARGE_BAND: [number, number][] = [
  [0, 8],
  [10, 40],
  [18, 62],
  [25, 82],
  [40, 95],
];
export function margeSubscore(marginPct: number): number {
  return bandSubscore(MARGE_BAND, marginPct);
}

// yield_net_pct band (params: faible 3 / correct 4,5 / bon 6)
const YIELD_BAND: [number, number][] = [
  [1.0, 8],
  [3.0, 40],
  [4.5, 62],
  [6.0, 82],
  [7.5, 95],
];
export function yieldNetSubscore(netPct: number): number {
  return bandSubscore(YIELD_BAND, netPct);
}

// spread_pct band (params: faible 10 / correct 25 / bon 50)
const SPREAD_BAND: [number, number][] = [
  [-10, 5],
  [10, 40],
  [25, 62],
  [50, 82],
  [75, 95],
];
export function spreadSubscore(spreadPct: number): number {
  return bandSubscore(SPREAD_BAND, spreadPct);
}

// promotion verdict ladder (params.scoring.verdicts.promotion)
export function promotionVerdict(total: number): string {
  if (total >= 70) return "Go";
  if (total >= 50) return "Conditionnel";
  return "Passer";
}

// detention / arbitrage verdict ladders (params.scoring.verdicts : 65 / 45)
export function detentionVerdict(total: number): string {
  if (total >= 65) return "Conserver";
  if (total >= 45) return "Surveiller";
  return "Ceder";
}
export function arbitrageVerdict(total: number): string {
  if (total >= 65) return "Fenetre ouverte";
  if (total >= 45) return "Fenetre etroite";
  return "Fenetre fermee";
}
export function landbankVerdict(total: number): string {
  if (total >= 65) return "Prioritaire";
  if (total >= 45) return "A phaser";
  return "En attente";
}

// Uplift (valeur résiduelle vs foncier marché) -> subscore, for the Monte Claro
// usage selector. Widget calibration (no backend uplift pillar): anchored so the
// optimal usage reproduces the zone score exactly, alternatives degrade it.
const UPLIFT_BAND: [number, number][] = [
  [-40, 5],
  [0, 40],
  [15, 62],
  [40, 82],
  [80, 95],
];
export function upliftSubscore(upliftPct: number): number {
  return bandSubscore(UPLIFT_BAND, upliftPct);
}

// ---------------------------------------------------------------------------
// K-REST featured assets on the mode pages (client-side live recompute, like
// HAYA above). Fictional but realistic; every market figure (rates, market
// rent, median, realizable value, rotation) is read live from the freguesia
// row so the asset stays aligned with the zone by construction.
// ---------------------------------------------------------------------------
// Ribeira Sul : immeuble de rapport, Santa Marinha (détention résidentiel).
export const RIBEIRA = {
  surface: 1800,       // m² locatifs
  lots: 24,
  acquisition: 2300,   // €/m² acquis
  travaux: 340,        // €/m² de capex
  base: 2640,          // base all-in du yield = acquisition + travaux
  rentMin: 8,
  rentMax: 16,
  rentDefault: 11.5,   // €/m²/mois ≈ loyer de marché de la freguesia (139 €/m²/an)
};
// Cais Poente : actif trophée front de fleuve, Santa Marinha (arbitrage).
export const CAIS = {
  priceMin: 2100,
  priceMax: 3400,
  priceDefault: 2520,  // €/m², spread ~+12% vs médiane Gaia
  delayExp: 4,         // délai = rotation zone × (prix / valeur réalisable)^exp
};
// Monte Claro : réserve foncière, Canidelo (landbank). Le sélecteur d'usages lit
// la table `usages` du breakdown de la freguesia (valeurs résiduelles réelles).
export const MONTE = {
  surface: 12000,      // m² de terrain
};
