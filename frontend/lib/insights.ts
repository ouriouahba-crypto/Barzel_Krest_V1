// Deterministic insight generator — no AI. Pure functions that compose French
// sentences from real scoring data (templates + actual numbers, never generic
// filler). Reused by the overview page and, later, the mode pages.

import { ModeScore } from "./api";
import { Mode, MODES, MODE_LABEL, MODE_KPI, classLabel, median, pillarValue, verdictTone } from "./scoring";
import { displayName } from "./useGaia";

// City-level (municipio) score + freguesia rows, per mode, for one class.
export interface OverviewByMode {
  scores: Partial<Record<Mode, ModeScore>>;   // municipio score per mode
  freg: Partial<Record<Mode, ModeScore[]>>;    // freguesia rows per mode
}

// Positive-verdict word per mode (for prose; data labels may be unaccented).
const GOOD_WORD: Record<Mode, string> = {
  promotion: "Go",
  detention: "Conserver",
  arbitrage: "Fenêtre ouverte",
  landbank: "Prioritaire",
};

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function num(m: Mode, v: number): string {
  return `${v.toFixed(MODE_KPI[m].digits)}${MODE_KPI[m].unit}`;
}

// The dominant investment mode = highest city (municipio) score.
export function bestMode(scores: Partial<Record<Mode, ModeScore>>): Mode | null {
  let best: Mode | null = null;
  let top = -Infinity;
  for (const m of MODES) {
    const s = scores[m];
    if (s && s.total > top) {
      top = s.total;
      best = m;
    }
  }
  return best;
}

function goFreg(rows: ModeScore[], m: Mode): ModeScore[] {
  return rows.filter((r) => verdictTone(m, r.verdict) === "good");
}

function kpiRange(rows: ModeScore[], m: Mode): [number, number] | null {
  const vals = rows
    .map((r) => pillarValue(r.pillars, MODE_KPI[m].pillar))
    .filter((v): v is number => v != null);
  if (!vals.length) return null;
  return [Math.min(...vals), Math.max(...vals)];
}

// "marges de 29 à 30 %" (or "marge de 30 %" when a single value).
function rangePhrase(m: Mode, lo: number, hi: number): string {
  const noun = { promotion: "marge", detention: "rendement net", arbitrage: "spread", landbank: "constructibilité" }[m];
  const d = MODE_KPI[m].digits;
  const u = MODE_KPI[m].unit;
  if (Math.abs(hi - lo) < Math.pow(10, -d) / 2) return `${noun} de ${hi.toFixed(d)}${u}`;
  return `${noun}s de ${lo.toFixed(d)} à ${hi.toFixed(d)}${u}`;
}

// A secondary driver clause (a second real number) where the data supports it.
function driverClause(m: Mode, good: ModeScore[]): string {
  if (m === "promotion") {
    const prems = good
      .map((r) => r.pillars.find((p) => p.pillar === "marge")?.breakdown?.premium_pct)
      .filter((v): v is number => v != null);
    const mp = median(prems);
    if (mp != null) return `, portées par une prime neuf de ${Math.round(mp)}%`;
  }
  if (m === "arbitrage") {
    const app = pillarValue(good[0]?.pillars ?? [], "appetit_institutionnel");
    if (app != null) return `, appétit institutionnel ${app.toFixed(2)}`;
  }
  return "";
}

function classSuffix(assetClass: string): string {
  return assetClass === "residential" ? "" : ` en ${classLabel(assetClass).toLowerCase()}`;
}

// "de promotion" but "d'arbitrage" (elision before a vowel).
function marketOf(label: string): string {
  return /^[aeiouyéèêh]/i.test(label) ? `marché d'${label}` : `marché de ${label}`;
}

// 1 sentence verdict for the city: dominant mode, count of top-verdict freguesias,
// the dominant native metric range, and (where available) a driver.
export function cityInsight(data: OverviewByMode, assetClass: string): string {
  const bm = bestMode(data.scores);
  if (!bm || !data.scores[bm]) return "Chargement du marché…";
  const city = cap(data.scores[bm]!.city);
  const label = MODE_LABEL[bm].toLowerCase();
  const rows = data.freg[bm] ?? [];
  const good = goFreg(rows, bm);
  const suffix = classSuffix(assetClass);

  // Degraded: no freguesia clears the top verdict for the dominant mode.
  if (!good.length) {
    const rng = kpiRange(rows, bm);
    const metric = rng ? `, ${rangePhrase(bm, rng[0], rng[1])}` : "";
    return `${city} reste sélectif${suffix} : aucune freguesia ${GOOD_WORD[bm]} en ${label} ce cycle${metric}.`;
  }

  const names = good.length <= 3 ? ` (${good.map((r) => displayName(r.zone_name)).join(", ")})` : "";
  const rng = kpiRange(good, bm);
  const metric = rng ? `, ${rangePhrase(bm, rng[0], rng[1])}` : "";
  const driver = rng ? driverClause(bm, good) : "";
  const plural = good.length > 1 ? "s" : "";
  return `${city} est un ${marketOf(label)}${suffix} : ${good.length} freguesia${plural} ${GOOD_WORD[bm]}${names}${metric}${driver}.`;
}

// 1 short sentence per mode, citing at least one real number from its KPI.
export function modeInsight(score: ModeScore, assetClass: string): string {
  const m = score.mode;
  const kv = pillarValue(score.pillars, MODE_KPI[m].pillar);
  if (kv == null) return `${score.verdict} au niveau ville${classSuffix(assetClass)}.`;
  const v = num(m, kv);
  switch (m) {
    case "promotion":
      return `Marge de ${v} sur le prix neuf réalisable.`;
    case "detention":
      return `Rendement net de ${v} après charges et fiscalité.`;
    case "arbitrage":
      return `Spread de ${v} face à la médiane de marché.`;
    case "landbank": {
      const bu = score.pillars.find((p) => p.pillar === "valeur_meilleur_usage" && p.applicable)?.native.label;
      return `Constructibilité ${v}${bu ? ` · ${bu}` : ""}.`;
    }
    default:
      return `${score.verdict} — ${v}.`;
  }
}
