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
};
export function verdictLabel(verdict: string): string {
  return VERDICT_LABEL[verdict] ?? verdict;
}

// Solid charte colour for a verdict (chart bars, accents) — matches the score ramp.
const VERDICT_COLOR: Record<"good" | "mid" | "low", string> = {
  good: "#2F6B3D", // deep green
  mid: "#C9A86A",  // gold
  low: "#9E5B5B",  // muted red
};
export function verdictColor(mode: Mode, verdict: string): string {
  return VERDICT_COLOR[verdictTone(mode, verdict)];
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

// The mode-specific key figure: which pillar + label/unit
export const MODE_KPI: Record<Mode, { pillar: string; label: string; unit: string; digits: number }> = {
  promotion: { pillar: "marge", label: "Marge médiane", unit: "%", digits: 0 },
  detention: { pillar: "rendement_net", label: "Yield net médian", unit: "%", digits: 1 },
  arbitrage: { pillar: "spread", label: "Spread médian", unit: "%", digits: 0 },
  landbank: { pillar: "constructibilite", label: "Constructibilité méd.", unit: "/100", digits: 0 },
};

// Native headline per mode (fallbacks if the API label is missing)
export function nativeHint(mode: Mode): string {
  return {
    promotion: "marge % · absorption",
    detention: "rendement net % · énergie",
    arbitrage: "spread % · appétit",
    landbank: "constructibilité · meilleur usage",
  }[mode];
}

// ---------------------------------------------------------------------------
// Haya — client-side margin recompute (formula identical to the backend).
// cost = 1.261 × (construction + foncier); marge = (prix net TVA − cost)/cost.
// The base economics match the backend (construction 1700, foncier 1035 = 18%
// of the 5750 base sale, VAT 23%). Only the sale price moves with the slider.
// ---------------------------------------------------------------------------
export const HAYA = {
  construction: 1700,
  foncier: 1035,
  vatPct: 23,
  freguesiaMedian: 2721,
  baseSale: 5750,
  saleMin: 3500,
  saleMax: 8000,
};

const COST_FACTOR = 1.261; // 1 + dev_cost_stack(0.18) + finance(LTV0.6×debt0.045×3y)

export function hayaCost() {
  return COST_FACTOR * (HAYA.construction + HAYA.foncier);
}

export function hayaMargin(salePerM2: number): number {
  const netSale = salePerM2 / (1 + HAYA.vatPct / 100);
  const cost = hayaCost();
  return ((netSale - cost) / cost) * 100;
}

export function hayaPremium(salePerM2: number): number {
  return (salePerM2 / HAYA.freguesiaMedian - 1) * 100;
}

// marge_pct band -> 0-100 subscore (mirrors params bands: faible 10 / correct 18 / bon 25)
const MARGE_BAND: [number, number][] = [
  [0, 8],
  [10, 40],
  [18, 62],
  [25, 82],
  [40, 95],
];

export function margeSubscore(marginPct: number): number {
  const pts = MARGE_BAND;
  if (marginPct <= pts[0][0]) return pts[0][1];
  if (marginPct >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, s0] = pts[i];
    const [x1, s1] = pts[i + 1];
    if (marginPct >= x0 && marginPct <= x1) {
      return s0 + ((s1 - s0) * (marginPct - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

// promotion verdict ladder (params.scoring.verdicts.promotion)
export function promotionVerdict(total: number): string {
  if (total >= 70) return "Go";
  if (total >= 50) return "Conditionnel";
  return "Passer";
}
