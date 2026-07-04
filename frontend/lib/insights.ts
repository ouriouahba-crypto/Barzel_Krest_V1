// Deterministic insight generator (no AI). Pure functions that compose French
// sentences from real scoring data (templates + actual numbers, never generic
// filler). Reused by the overview page and, later, the mode pages.

import { MargeBreakdown, ModeScore } from "./api";
import { Mode, MODES, MODE_LABEL, MODE_KPI, classLabel, median, pillarValue, verdictLabel, verdictTone } from "./scoring";
import { displayName, shortName } from "./useGaia";
import { PmRow } from "./priceMargin";
import { RdRow } from "./rendement";
import { ArbRow, pctSigned } from "./arbitrage";
import { FcRow } from "./foncier";

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

// "meilleur/meilleure" agreeing with the metric noun's gender.
const MEILLEUR: Record<Mode, string> = {
  promotion: "meilleure", // marge (f)
  detention: "meilleur", // rendement net (m)
  arbitrage: "meilleur", // spread (m)
  landbank: "meilleure", // constructibilité (f)
};

// "marges de 29 à 30 %" (plural range) or "spread 20 %" (single value).
function rangePhrase(m: Mode, lo: number, hi: number): string {
  const noun = { promotion: "marge", detention: "rendement net", arbitrage: "spread", landbank: "constructibilité" }[m];
  const d = MODE_KPI[m].digits;
  const u = MODE_KPI[m].unit;
  if (Math.abs(hi - lo) < Math.pow(10, -d) / 2) return `${noun} ${hi.toFixed(d)}${u}`;
  return `${noun}s de ${lo.toFixed(d)} à ${hi.toFixed(d)}${u}`;
}

// A secondary driver clause (a second real number) where the data supports it.
function driverClause(m: Mode, good: ModeScore[]): string {
  if (m === "promotion") {
    const prems = good
      .map((r) => (r.pillars.find((p) => p.pillar === "marge")?.breakdown as MargeBreakdown | undefined)?.premium_pct)
      .filter((v): v is number => v != null);
    const mp = median(prems);
    if (mp != null) return `, portées par une prime neuf de ${Math.round(mp)}%`;
  }
  if (m === "arbitrage") {
    const app = pillarValue(good[0]?.pillars ?? [], "appetit_institutionnel");
    if (app != null) {
      if (app >= 0.7) return ", appétit institutionnel soutenu";
      if (app >= 0.4) return ", appétit institutionnel modéré";
      // < 0.4 : pas de clause
    }
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

  // Degraded: no freguesia clears the top verdict; cite the single best, not a range.
  if (!good.length) {
    const top = rows
      .map((r) => ({ r, v: pillarValue(r.pillars, MODE_KPI[bm].pillar) }))
      .filter((x): x is { r: ModeScore; v: number } => x.v != null)
      .sort((a, b) => b.v - a.v)[0];
    const metric = top ? `, ${MEILLEUR[bm]} ${rangePhrase(bm, top.v, top.v)} à ${shortName(top.r.zone_name)}` : "";
    return `${city} reste sélectif${suffix} : aucune freguesia ${GOOD_WORD[bm]} en ${label} ce cycle${metric}.`;
  }

  const names = good.length <= 3 ? ` (${good.map((r) => displayName(r.zone_name)).join(", ")})` : "";
  const rng = kpiRange(good, bm);
  const metric = rng ? `, ${rangePhrase(bm, rng[0], rng[1])}` : "";
  const driver = rng ? driverClause(bm, good) : "";
  const plural = good.length > 1 ? "s" : "";
  const tail = `${good.length} freguesia${plural} ${GOOD_WORD[bm]}${names}${metric}${driver}`;

  // Opening verb graded by the dominant mode's city (municipio) score.
  const muni = data.scores[bm]!.total;
  const la = /^[aeiouyéèêh]/i.test(label) ? "l'" : "la ";
  if (muni >= 60) return `${city} est un ${marketOf(label)}${suffix} : ${tail}.`;
  if (muni >= 50) return `${city} penche vers ${la}${label}${suffix} : ${tail}.`;
  return `${city} n'offre pas de lecture dominante ce cycle : ${la}${label}${suffix} ressort en tête avec ${tail}.`;
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
      // Don't repeat the native indicator (constructibilité). Frame the reserve
      // by its best use + achievable value instead.
      const bu = score.pillars.find((p) => p.pillar === "valeur_meilleur_usage" && p.applicable);
      if (bu && typeof bu.native.value === "number") {
        const usage = /meilleur usage (\S+)/.exec(bu.native.label)?.[1] ?? "mixte";
        return `Réserve foncière à activer : meilleur usage ${usage} à ${Math.round(bu.native.value).toLocaleString("fr-FR")} €/m².`;
      }
      return `Réserve foncière à activer : ${verdictLabel(score.verdict)}.`;
    }
    default:
      return `${score.verdict} : ${v}.`;
  }
}

// ---------------------------------------------------------------------------
// Mode pages: page-level insights (Prix & marge, Rendement) + anomaly note.
// ---------------------------------------------------------------------------

// "la promotion <X>" / "la détention <X>" with gender/agreement per class.
const CLASS_ADJ_FR: Record<string, string> = {
  residential: "résidentielle",
  office: "de bureaux",
  hotel: "hôtelière",
  logistics: "logistique",
  retail: "commerciale",
};

// "Name (30%)" list with a French final "et".
function marginList(rows: PmRow[]): string {
  const parts = rows.map((r) => `${r.name} (${Math.round(r.marginPct)}%)`);
  if (parts.length <= 1) return parts.join("");
  return parts.slice(0, -1).join(", ") + " et " + parts[parts.length - 1];
}

// 1-2 sentences: how many freguesias carry promotion, the 2-3 best (with margin),
// and why the rest doesn't pencil. Verb graded by the count of viable freguesias.
export function priceMarginInsight(rows: PmRow[], assetClass: string): string {
  const adj = CLASS_ADJ_FR[assetClass] ?? classLabel(assetClass).toLowerCase();
  const viable = rows
    .filter((r) => verdictTone("promotion", r.verdict) !== "low")
    .sort((a, b) => b.marginPct - a.marginPct);
  const n = viable.length;

  if (n === 0) {
    const best = [...rows].sort((a, b) => b.marginPct - a.marginPct)[0];
    const tail = best ? ` : meilleure marge ${Math.round(best.marginPct)}% à ${best.short}` : "";
    return `Aucune freguesia ne porte la promotion ${adj} ce cycle${tail}.`;
  }
  // Closing clause computed on the non-viable set: pure loss vs thin/absorption.
  const nonViable = rows.filter((r) => verdictTone("promotion", r.verdict) === "low");
  const allNeg = nonViable.length > 0 && nonViable.every((r) => r.marginPct < 0);
  const why =
    nonViable.length === 0
      ? ""
      : allNeg
      ? " Au-delà, le prix neuf réalisable ne couvre plus le coût de revient."
      : " Au-delà, marges trop minces ou marchés trop étroits pour absorber le neuf.";
  const list = marginList(viable.slice(0, 3));
  const head =
    n >= 3
      ? `La promotion ${adj} tient sur ${n} freguesias, menées par ${list}.`
      : n === 2
      ? `La promotion ${adj} tient sur 2 freguesias : ${list}.`
      : `La promotion ${adj} ne tient que sur une freguesia : ${list}.`;
  return `${head}${why}`;
}

// 1-2 sentences for the Rendement page: how many freguesias justify holding, the
// 2-3 best (with net yield), and why the rest doesn't hold, computed from the
// most common weakest pillar of the non-Conserver set. Same graded spirit as
// priceMarginInsight.
const DET_CLAUSE: Record<string, string> = {
  rendement_net: "des loyers trop bas face aux prix",
  profondeur_locative: "des marchés locatifs trop étroits",
  resilience: "des marchés locatifs trop fragiles",
  fiscalite: "une fiscalité qui érode le loyer",
  risque_energie: "un risque énergétique qui pèse sur le parc",
  portage: "un coût de portage supérieur au rendement",
};

// "Name (3.5%)" list with a French final "et".
function yieldList(rows: RdRow[]): string {
  const parts = rows.map((r) => `${r.name} (${r.yieldNet.toFixed(1)}%)`);
  if (parts.length <= 1) return parts.join("");
  return parts.slice(0, -1).join(", ") + " et " + parts[parts.length - 1];
}

export function detentionInsight(rows: RdRow[], assetClass: string): string {
  const adj = CLASS_ADJ_FR[assetClass] ?? classLabel(assetClass).toLowerCase();
  const keep = rows
    .filter((r) => verdictTone("detention", r.verdict) === "good")
    .sort((a, b) => b.yieldNet - a.yieldNet);
  const n = keep.length;

  // Signature message of the page: when the highest facial yield sits on a Céder
  // freguesia, name the inverted-yield trap explicitly.
  const maxY = rows.length ? rows.reduce((a, b) => (b.yieldNet > a.yieldNet ? b : a)) : null;
  const trap =
    maxY && verdictTone("detention", maxY.verdict) === "low"
      ? ` Les yields les plus élevés (${maxY.short} ${maxY.yieldNet.toFixed(1)}%) sont des pièges de fragilité : marchés étroits, vacance longue.`
      : "";

  if (n === 0) {
    if (trap) return `Aucune freguesia ne justifie de conserver${classSuffix(assetClass)} ce cycle.${trap}`;
    const best = [...rows].sort((a, b) => b.yieldNet - a.yieldNet)[0];
    const tail = best ? ` : meilleur yield net ${best.yieldNet.toFixed(1)}% à ${best.short}` : "";
    return `Aucune freguesia ne justifie de conserver${classSuffix(assetClass)} ce cycle${tail}.`;
  }
  // Closing clause: the yield trap when it applies, else the most common weakest
  // pillar across the non-Conserver set.
  let why = "";
  if (!trap) {
    const rest = rows.filter((r) => verdictTone("detention", r.verdict) !== "good");
    if (rest.length) {
      const counts = new Map<string, number>();
      for (const r of rest) if (r.weakest) counts.set(r.weakest, (counts.get(r.weakest) ?? 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const reason = top ? DET_CLAUSE[top[0]] : undefined;
      if (reason) why = ` Le reste bute sur ${reason}.`;
    }
  }
  const list = yieldList(keep.slice(0, 3));
  const head =
    n >= 3
      ? `La détention ${adj} tient sur ${n} freguesias, menées par ${list}.`
      : n === 2
      ? `La détention ${adj} tient sur 2 freguesias : ${list}.`
      : `La détention ${adj} ne tient que sur une freguesia : ${list}.`;
  return `${head}${trap || why}`;
}

// 1-2 sentences for the Arbitrage page: how many disposal windows are open, the
// 2-3 best (with spread), and why the rest stays shut. Same graded spirit as the
// other mode insights; the signature clause mirrors the détention yield trap.
const ARB_CLAUSE: Record<string, string> = {
  spread: "des spreads trop minces face à la médiane",
  appetit_institutionnel: "un appétit institutionnel insuffisant",
  momentum_cycle: "un cycle de prix défavorable au timing de cession",
  frictions_sortie: "des frictions de sortie trop lourdes",
  cout_opportunite: "un coût du capital qui mange l'écart",
};

// "Name (+21%)" list with a French final "et".
function spreadList(rows: ArbRow[]): string {
  const parts = rows.map((r) => `${r.name} (${pctSigned(r.spreadPct, 0)})`);
  if (parts.length <= 1) return parts.join("");
  return parts.slice(0, -1).join(", ") + " et " + parts[parts.length - 1];
}

export function arbitrageInsight(rows: ArbRow[], assetClass: string): string {
  const suffix = classSuffix(assetClass);
  const open = rows
    .filter((r) => verdictTone("arbitrage", r.verdict) === "good")
    .sort((a, b) => b.spreadPct - a.spreadPct);
  const n = open.length;

  // Signature message of the page: when the widest spread sits outside the open
  // windows, it is a paper spread: no institutional buyer, no window.
  const maxS = rows.length ? rows.reduce((a, b) => (b.spreadPct > a.spreadPct ? b : a)) : null;
  const trap =
    maxS && verdictTone("arbitrage", maxS.verdict) !== "good"
      ? ` Les spreads les plus larges (${maxS.short} ${pctSigned(maxS.spreadPct, 0)}) sont théoriques : sans acheteur institutionnel, la fenêtre reste fermée.`
      : "";

  if (n === 0) {
    if (trap) return `Aucune fenêtre de cession n'est ouverte${suffix} ce cycle.${trap}`;
    const best = [...rows].sort((a, b) => b.spreadPct - a.spreadPct)[0];
    const tail = best ? ` : meilleur spread ${pctSigned(best.spreadPct, 0)} à ${best.short}` : "";
    return `Aucune fenêtre de cession n'est ouverte${suffix} ce cycle${tail}.`;
  }
  let why = "";
  if (!trap) {
    const rest = rows.filter((r) => verdictTone("arbitrage", r.verdict) !== "good");
    if (rest.length) {
      const counts = new Map<string, number>();
      for (const r of rest) if (r.weakest) counts.set(r.weakest, (counts.get(r.weakest) ?? 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const reason = top ? ARB_CLAUSE[top[0]] : undefined;
      if (reason) why = ` Le reste bute sur ${reason}.`;
    }
  }
  const list = spreadList(open.slice(0, 3));
  const head =
    n >= 3
      ? `La fenêtre de cession est ouverte sur ${n} freguesias${suffix}, menées par ${list}.`
      : n === 2
      ? `La fenêtre de cession est ouverte sur 2 freguesias${suffix} : ${list}.`
      : `Une seule fenêtre de cession est ouverte${suffix} : ${list}.`;
  return `${head}${trap || why}`;
}

// 1-2 sentences for the Foncier page: how many freguesias are priority land
// activations, the 2-3 best (with uplift), and why the rest waits. Signature
// clause: high constructibility without a market is not activatable.
const LAND_CLAUSE: Record<string, string> = {
  constructibilite: "des droits à bâtir trop contraints",
  valeur_meilleur_usage: "des valeurs de sortie trop basses pour couvrir le foncier",
  connectivite: "une desserte insuffisante pour porter un programme",
  incitations: "des incitations locales trop faibles",
  risque_timing: "un risque réglementaire qui repousse l'activation",
};

// "Name (+47%)" list with a French final "et".
function upliftList(rows: FcRow[]): string {
  const parts = rows.map((r) => `${r.name} (${pctSigned(r.upliftPct, 0)})`);
  if (parts.length <= 1) return parts.join("");
  return parts.slice(0, -1).join(", ") + " et " + parts[parts.length - 1];
}

export function landbankInsight(rows: FcRow[]): string {
  const prio = rows
    .filter((r) => verdictTone("landbank", r.verdict) === "good")
    .sort((a, b) => b.upliftPct - a.upliftPct);
  const n = prio.length;

  // Signature message of the page: the most constructible freguesia is not the
  // most activatable when its market cannot absorb a programme.
  const maxC = rows.length ? rows.reduce((a, b) => (b.constructibilite > a.constructibilite ? b : a)) : null;
  const trap =
    maxC && verdictTone("landbank", maxC.verdict) !== "good"
      ? ` Constructible ne veut pas dire activable : ${maxC.short} (constructibilité ${Math.round(maxC.constructibilite)}) attend encore son marché.`
      : "";

  if (n === 0) {
    if (trap) return `Aucune freguesia n'est prioritaire à l'activation foncière ce cycle.${trap}`;
    const best = [...rows].sort((a, b) => b.upliftPct - a.upliftPct)[0];
    const tail = best ? ` : meilleur uplift ${pctSigned(best.upliftPct, 0)} à ${best.short}` : "";
    return `Aucune freguesia n'est prioritaire à l'activation foncière ce cycle${tail}.`;
  }
  let why = "";
  if (!trap) {
    const rest = rows.filter((r) => verdictTone("landbank", r.verdict) !== "good");
    if (rest.length) {
      const counts = new Map<string, number>();
      for (const r of rest) if (r.weakest) counts.set(r.weakest, (counts.get(r.weakest) ?? 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const reason = top ? LAND_CLAUSE[top[0]] : undefined;
      if (reason) why = ` Le reste bute sur ${reason}.`;
    }
  }
  const list = upliftList(prio.slice(0, 3));
  const head =
    n >= 3
      ? `L'activation foncière est prioritaire sur ${n} freguesias, menées par ${list}.`
      : n === 2
      ? `L'activation foncière est prioritaire sur 2 freguesias : ${list}.`
      : `Une seule freguesia est prioritaire à l'activation foncière : ${list}.`;
  return `${head}${trap || why}`;
}

// ---------------------------------------------------------------------------
// Comparer: per-freguesia dominant signal + cross-freguesia synthesis.
// Pure recomposition of the mode scores; no new business computation.
// ---------------------------------------------------------------------------

export interface CompareModeCell {
  mode: Mode;
  total: number;
  verdict: string;
  metric: number | null;    // marge % / yield net % / spread % / uplift %
  residual?: number | null; // landbank: valeur résiduelle €/m² (synthesis)
}
export interface CompareColumn {
  name: string;
  short: string;
  cells: CompareModeCell[];
}

// Follower prose: "la détention et l'arbitrage suivent".
const MODE_PROSE: Record<Mode, string> = {
  promotion: "la promotion",
  detention: "la détention",
  arbitrage: "l'arbitrage",
  landbank: "le foncier",
};

function cellMetricPhrase(c: CompareModeCell): string {
  if (c.metric == null) return verdictLabel(c.verdict);
  switch (c.mode) {
    case "promotion": return `marge ${Math.round(c.metric)}%`;
    case "detention": return `yield net ${c.metric.toFixed(1)}%`;
    case "arbitrage": return `spread ${pctSigned(c.metric, 0)}`;
    default: return `uplift ${pctSigned(c.metric, 0)}`;
  }
}

// One-line dominant signal for a freguesia: its best mode with the native
// number, the two runners-up as prose. Ex: "Profil promotion : marge 30%,
// le foncier et la détention suivent."
export function compareInsight(cells: CompareModeCell[]): string {
  if (!cells.length) return "";
  const ranked = [...cells].sort((a, b) => b.total - a.total);
  const best = ranked[0];
  const followers = ranked.slice(1, 3).map((c) => MODE_PROSE[c.mode]);
  const tail = followers.length ? `, ${followers.join(" et ")} suivent` : "";
  return `Profil ${MODE_LABEL[best.mode].toLowerCase()} : ${cellMetricPhrase(best)}${tail}.`;
}

// Winner-vs-runner value pair per mode, for the synthesis parenthetical. The
// landbank compares residual land value (874 vs 814 €/m²), the money figure.
function vsPhrase(mode: Mode, win: CompareModeCell, run: CompareModeCell): string {
  if (mode === "landbank") {
    if (win.residual == null || run.residual == null) return "";
    return ` (${Math.round(win.residual).toLocaleString("fr-FR")} vs ${Math.round(run.residual).toLocaleString("fr-FR")} €/m²)`;
  }
  if (win.metric == null || run.metric == null) return "";
  switch (mode) {
    case "promotion": return ` (${Math.round(win.metric)}% vs ${Math.round(run.metric)}%)`;
    case "detention": return ` (${win.metric.toFixed(1)}% vs ${run.metric.toFixed(1)}%)`;
    default: return ` (${pctSigned(win.metric, 0)} vs ${pctSigned(run.metric, 0)})`;
  }
}

// Mode names in the synthesis ("en promotion", "en valeur résiduelle foncière").
const MODE_VS: Record<Mode, string> = {
  promotion: "promotion",
  detention: "détention",
  arbitrage: "arbitrage",
  landbank: "valeur résiduelle foncière",
};

// One sentence: who wins which mode, with the numbers on each winner's leading
// mode. Ex: "Santa Marinha domine en promotion (30% vs 29%), en détention et en
// arbitrage ; Madalena prend l'avantage en valeur résiduelle foncière (874 vs
// 814 €/m²)."
export function compareSynthesis(cols: CompareColumn[]): string {
  if (cols.length < 2) return "";
  // Winner per mode (by score); the value pair compares the winner with the
  // BEST of the other selected freguesias on the compared value itself
  // (residual for landbank, native metric otherwise), not the 2nd by score.
  const wins = new Map<number, { mode: Mode; win: CompareModeCell; run: CompareModeCell }[]>();
  for (const m of MODES) {
    const entries = cols
      .map((c, i) => ({ i, cell: c.cells.find((x) => x.mode === m) }))
      .filter((e): e is { i: number; cell: CompareModeCell } => !!e.cell);
    if (entries.length < 2) continue;
    const ranked = [...entries].sort((a, b) => b.cell.total - a.cell.total);
    const cmp = (c: CompareModeCell) =>
      m === "landbank" ? (c.residual ?? -Infinity) : (c.metric ?? -Infinity);
    const run = entries
      .filter((e) => e.i !== ranked[0].i)
      .sort((a, b) => cmp(b.cell) - cmp(a.cell))[0].cell;
    const list = wins.get(ranked[0].i) ?? [];
    list.push({ mode: m, win: ranked[0].cell, run });
    wins.set(ranked[0].i, list);
  }
  const verbs = ["domine en", "prend l'avantage en", "se distingue en"];
  const parts: string[] = [];
  const order = [...wins.entries()].sort((a, b) => b[1].length - a[1].length);
  order.forEach(([colIdx, modes], k) => {
    const names = modes.map((w, j) =>
      `${MODE_VS[w.mode]}${j === 0 ? vsPhrase(w.mode, w.win, w.run) : ""}`
    );
    const list =
      names.length > 1 ? names.slice(0, -1).join(", en ") + " et en " + names[names.length - 1] : names[0];
    parts.push(`${cols[colIdx].short} ${verbs[Math.min(k, verbs.length - 1)]} ${list}`);
  });
  return parts.length ? parts.join(" ; ") + "." : "";
}

// Why a decent-KPI freguesia still fails: the weakest pillar behind the low verdict.
const PILLAR_REASON: Record<string, string> = {
  // promotion
  absorption: "un marché trop étroit pour absorber du neuf",
  momentum_prix: "une dynamique de prix trop faible",
  constructibilite: "une constructibilité insuffisante",
  risque_sortie: "un risque de sortie trop élevé",
  // détention
  profondeur_locative: "un marché locatif trop étroit (parc réduit, rotation lente)",
  resilience: "un marché locatif trop fragile pour tenir la vacance",
  risque_energie: "un risque énergétique (MEPS) trop lourd",
  fiscalite: "une fiscalité de détention pénalisante",
  portage: "un coût de portage qui absorbe le loyer",
  // arbitrage
  appetit_institutionnel: "un appétit institutionnel insuffisant",
  momentum_cycle: "un cycle de prix défavorable au timing de cession",
  frictions_sortie: "des frictions de sortie trop lourdes",
  cout_opportunite: "un coût du capital qui mange l'écart",
  // landbank
  valeur_meilleur_usage: "des valeurs de sortie trop basses pour couvrir le foncier",
  connectivite: "une desserte insuffisante pour porter un programme",
  incitations: "des incitations locales trop faibles",
  risque_timing: "un risque réglementaire qui repousse l'activation",
};

// The most striking exception, per mode: a freguesia whose native KPI looks fine
// but whose verdict is the low one, named by its weakest other pillar, or null
// when no freguesia qualifies (nothing is displayed then; never forced).
//  - promotion: marge >= 8% (the verdict-cap threshold) but verdict Passer.
//  - detention: yield net >= the lowest yield among kept/watched freguesias, but
//    verdict Céder : it earns as much as places we keep, something else disqualifies it.
//  - arbitrage: spread >= 10% (the "faible" band edge) but verdict Fenêtre fermée,
//    a real premium the market cannot exit.
//  - landbank: constructibilité >= 50 (above the country default) but verdict
//    En attente : buildable land whose market is not there yet.
export function anomalyNote(mode: Mode, scores: ModeScore[]): string | null {
  const kpi = MODE_KPI[mode].pillar;
  const isLow = (s: ModeScore) => verdictTone(mode, s.verdict) === "low";
  let cands: ModeScore[];
  if (mode === "promotion") {
    cands = scores.filter((s) => isLow(s) && (pillarValue(s.pillars, kpi) ?? -Infinity) >= 8);
  } else if (mode === "detention") {
    const viable = scores
      .filter((s) => !isLow(s))
      .map((s) => pillarValue(s.pillars, kpi))
      .filter((v): v is number => v != null);
    if (!viable.length) return null;
    const floor = Math.min(...viable);
    cands = scores.filter((s) => isLow(s) && (pillarValue(s.pillars, kpi) ?? -Infinity) >= floor);
  } else if (mode === "arbitrage") {
    cands = scores.filter((s) => isLow(s) && (pillarValue(s.pillars, kpi) ?? -Infinity) >= 10);
  } else {
    cands = scores.filter((s) => isLow(s) && (pillarValue(s.pillars, kpi) ?? -Infinity) >= 50);
  }
  if (!cands.length) return null;
  const s = cands.sort((a, b) => (pillarValue(b.pillars, kpi) ?? 0) - (pillarValue(a.pillars, kpi) ?? 0))[0];
  const v = pillarValue(s.pillars, kpi)!;
  const weak = s.pillars
    .filter((p) => p.applicable && p.pillar !== kpi && p.subscore != null && PILLAR_REASON[p.pillar])
    .sort((a, b) => (a.subscore ?? 100) - (b.subscore ?? 100))[0];
  const reason = weak ? PILLAR_REASON[weak.pillar] : "des fondamentaux trop faibles";
  const metric =
    mode === "promotion" ? `${Math.round(v)}% de marge`
    : mode === "detention" ? `${v.toFixed(1)}% de yield net`
    : mode === "arbitrage" ? `${pctSigned(v, 0)} de spread`
    : `une constructibilité de ${Math.round(v)}`;
  return `${displayName(s.zone_name)} affiche ${metric} mais ${reason} : verdict ${verdictLabel(s.verdict)}.`;
}

/* ------------------------------------------------------------------ */
/* Trajectoire des prix (Vue d'ensemble) : insight déterministe        */
/* ------------------------------------------------------------------ */

// "Le prix <classe> de Gaia…" : noun-complement per class (masculine "prix").
const PRICE_OF: Record<string, string> = {
  residential: "résidentiel",
  office: "des bureaux",
  hotel: "hôtelier",
  logistics: "logistique",
  retail: "du commerce",
};

// One sentence under the trajectory title: 12-month move + shape of the recent
// year (second-half acceleration / steady / easing), computed from the series
// itself, no free text. Pure, no JSX.
export function trendInsight(
  points: { t: string; price: number }[],
  yoyPct: number | null,
  assetClass: string,
  cityName: string = "Gaia"
): string {
  if (points.length < 8 || yoyPct == null) return "Chargement de la trajectoire…";
  const of = PRICE_OF[assetClass] ?? assetClass;
  const move = `${yoyPct >= 0 ? "progresse de +" : "recule de "}${Math.abs(yoyPct).toFixed(1).replace(".", ",")}% sur 12 mois`;
  // Last 12 months split in halves: t3→t5 vs t5→t7 (growth in %).
  const h1 = (points[5].price / points[3].price - 1) * 100;
  const h2 = (points[7].price / points[5].price - 1) * 100;
  const shape =
    h2 > h1 + 1 ? "accélération au second semestre"
    : h2 < h1 - 1 ? "le rythme se tasse en fin de période"
    : "à un rythme régulier sur l'année";
  return `Le prix ${of} de ${cityName} ${move}, ${shape}.`;
}
