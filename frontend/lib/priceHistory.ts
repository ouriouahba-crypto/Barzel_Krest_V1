// Quarterly price trajectory for the overview panel: 8 quarters ending "now"
// (T2 2026). Pure and deterministic: the series is generated FROM the engine's
// city figures (median price €/m² + yoy %), so it is exactly coherent with the
// values displayed everywhere else (résidentiel : 2 474 €/m², +16,3 %, the
// INE-anchored engine anchors). Shape: calmer prior year, growth concentrated
// on the recent second half. Other classes share the same mechanic with a tiny
// per-class deterministic wiggle. ⚠️ Simulated history, to be replaced by the
// client's real per-class price series (see CLAUDE.md §1).

export interface PricePoint {
  t: string;     // quarter label, e.g. "T3 25"
  price: number; // €/m²
}

export const QUARTER_LABELS = ["T3 24", "T4 24", "T1 25", "T2 25", "T3 25", "T4 25", "T1 26", "T2 26"];

// Recent-year log-growth split (sums to 1), back-loaded: the second half of the
// last 12 months carries ~58 % of the annual move ("accélération au 2d semestre").
const RECENT_W = [0.18, 0.24, 0.28, 0.30];
// Prior year runs at 45 % of the current yoy, mildly accelerating too.
const PRIOR_W = [0.30, 0.33, 0.37];
const PRIOR_FACTOR = 0.45;

// Tiny deterministic per-class wiggle on interior points (anchors stay exact).
function wiggle(cls: string, i: number): number {
  let h = 0;
  const s = `${cls}#${i}`;
  for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * 0.008; // ±0,4 %
}

export function priceTrajectory(price: number, yoyPct: number, cls: string): PricePoint[] {
  const now = price;
  const yearAgo = now / (1 + yoyPct / 100);
  const g = Math.log(now / yearAgo); // annual log-growth (sign-safe)

  const p: number[] = new Array(8);
  p[7] = now;
  p[3] = yearAgo; // exact yoy anchor
  // t3 → t7 forward with back-loaded weights.
  let acc = yearAgo;
  for (let i = 0; i < 3; i++) {
    acc *= Math.exp(g * RECENT_W[i]);
    p[4 + i] = acc * (1 + wiggle(cls, 4 + i));
  }
  // t3 → t0 backwards at the calmer prior-year pace.
  const gPrior = g * PRIOR_FACTOR;
  acc = yearAgo;
  for (let i = 2; i >= 0; i--) {
    acc /= Math.exp(gPrior * PRIOR_W[i]);
    p[i] = acc * (1 + (i > 0 ? wiggle(cls, i) : 0));
  }
  return QUARTER_LABELS.map((t, i) => ({ t, price: Math.round(p[i]) }));
}
