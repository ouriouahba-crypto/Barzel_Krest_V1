// Deterministic insight generator (no AI). Pure functions that compose French
// sentences from real scoring data (templates + actual numbers, never generic
// filler). Reused by the overview page and, later, the mode pages.

import { MargeBreakdown, ModeScore } from "./api";
import { Mode, MODES, MODE_KPI, classLabel, fmtNum, median, pillarValue, verdictTone } from "./scoring";
import { displayName, shortName } from "./useGaia";
import { PmRow } from "./priceMargin";
import { RdRow } from "./rendement";
import { ArbRow, pctSigned } from "./arbitrage";
import { FcRow } from "./foncier";
import { translate } from "@/lib/i18n";
import { verdictDisplay, classLabelFor, modeLabel } from "@/lib/i18n/domain";
import type { Lang } from "@/lib/i18n/types";

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

// Rendu half-up sans zéro négatif : le MÊME chiffre que le label natif backend
// (une seule source de valeur formatée par carte de mode).
function num(m: Mode, v: number): string {
  return `${fmtNum(v, MODE_KPI[m].digits)}${MODE_KPI[m].unit}`;
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
// FR porte le pluriel dans le template (« {noun}s de … à … ») ; EN/PT restent au
// singulier. Les nombres passent par fmtNum, inchangés.
function rangePhrase(m: Mode, lo: number, hi: number, lang: Lang): string {
  const noun = translate("ci.metricNoun." + m, lang);
  const d = MODE_KPI[m].digits;
  const u = MODE_KPI[m].unit;
  if (Math.abs(hi - lo) < Math.pow(10, -d) / 2)
    return translate("ci.rangeSingle", lang, { noun, v: fmtNum(hi, d), u });
  return translate("ci.rangeSpan", lang, { noun, lo: fmtNum(lo, d), hi: fmtNum(hi, d), u });
}

// A secondary driver clause (a second real number) where the data supports it.
function driverClause(m: Mode, good: ModeScore[], lang: Lang): string {
  if (m === "promotion") {
    const prems = good
      .map((r) => (r.pillars.find((p) => p.pillar === "marge")?.breakdown as MargeBreakdown | undefined)?.premium_pct)
      .filter((v): v is number => v != null);
    const mp = median(prems);
    // Accord du participe avec la métrique : « marge 24 %, portée » (1 zone) vs
    // « marges de 24 à 30 %, portées » (plusieurs). L'anglais n'accorde pas (le
    // token est absent de son template). La prime citée est celle de la ZONE
    // (premium_pct), jamais celle de l'actif vedette.
    if (mp != null) {
      const portee =
        lang === "en" ? "" : lang === "pt" ? (good.length > 1 ? "puxadas" : "puxada") : good.length > 1 ? "portées" : "portée";
      return translate("ci.driver.promotion", lang, { portee, mp: Math.round(mp) });
    }
  }
  if (m === "arbitrage") {
    const app = pillarValue(good[0]?.pillars ?? [], "appetit_institutionnel");
    if (app != null) {
      if (app >= 0.7) return translate("ci.driver.arbHigh", lang);
      if (app >= 0.4) return translate("ci.driver.arbMod", lang);
      // < 0.4 : pas de clause
    }
  }
  return "";
}

// "de promotion" but "d'arbitrage" (elision before a vowel) in FR.
function marketOf(label: string, lang: Lang): string {
  if (lang === "en") return `${label} market`;
  if (lang === "pt") return `mercado de ${label}`;
  return /^[aeiouyéèêh]/i.test(label) ? `marché d'${label}` : `marché de ${label}`;
}

// Terme de maille de la ville, injecté aux insights pour qu'ils disent « commune »
// à Bruxelles et « freguesia » en PT. Les deux noms sont féminins : les accords
// (une/aucune/menées/prioritaire) tiennent sans changement. Défaut = freguesia
// (Gaia/Lisbonne inchangés au caractère près).
export type ZoneNoun = { sg: string; pl: string };
const FREG_NOUN: ZoneNoun = { sg: "freguesia", pl: "freguesias" };
const plurN = (n: number, noun: ZoneNoun) => (n > 1 ? noun.pl : noun.sg);

// Données pas encore chargées (rows vide) : on ne prononce JAMAIS un verdict de
// marché absolu (« Aucune… ce cycle ») sur une absence de données, sinon la
// synthèse contredit un tableau qui, lui, se remplira. Phrase neutre partagée,
// identique à cityInsight.
const LOADING = "Chargement du marché…";

// 1 sentence verdict for the city: dominant mode, count of top-verdict zones,
// the dominant native metric range, and (where available) a driver.
export function cityInsight(
  data: OverviewByMode,
  assetClass: string,
  noun: ZoneNoun = FREG_NOUN,
  lang: Lang = "fr"
): string {
  const bm = bestMode(data.scores);
  if (!bm || !data.scores[bm]) return translate("ci.loading", lang);
  const city = cap(data.scores[bm]!.city);
  const label = modeLabel(bm, lang).toLowerCase();
  const rows = data.freg[bm] ?? [];
  const good = goFreg(rows, bm);
  const suffix =
    assetClass === "residential"
      ? ""
      : translate("ins.suffixIn", lang, { cls: classLabelFor(assetClass, lang).toLowerCase() });
  // GOOD_WORD garde ses libellés FR comme CLÉ CANONIQUE de verdict : verdictDisplay
  // les rend dans la langue courante (identité en FR).
  const goodWord = verdictDisplay(GOOD_WORD[bm], lang);

  // Degraded: no freguesia clears the top verdict; cite the single best, not a range.
  if (!good.length) {
    const top = rows
      .map((r) => ({ r, v: pillarValue(r.pillars, MODE_KPI[bm].pillar) }))
      .filter((x): x is { r: ModeScore; v: number } => x.v != null)
      .sort((a, b) => b.v - a.v)[0];
    const metric = top
      ? translate("ci.degradedMetric", lang, {
          meilleur: MEILLEUR[bm],
          range: rangePhrase(bm, top.v, top.v, lang),
          short: shortName(top.r.zone_name),
        })
      : "";
    return translate("ci.degraded", lang, { city, suffix, sg: noun.sg, good: goodWord, label, metric });
  }

  const names = good.length <= 3 ? ` (${good.map((r) => displayName(r.zone_name)).join(", ")})` : "";
  const rng = kpiRange(good, bm);
  const metric = rng ? `, ${rangePhrase(bm, rng[0], rng[1], lang)}` : "";
  const driver = rng ? driverClause(bm, good, lang) : "";
  const tail = `${good.length} ${plurN(good.length, noun)} ${goodWord}${names}${metric}${driver}`;

  // Opening verb graded by the dominant mode's city (municipio) score.
  const muni = data.scores[bm]!.total;
  // Article du mode : élision FR devant voyelle, genre PT (le landbank est
  // masculin), rien en EN.
  const la =
    lang === "en" ? "" : lang === "pt" ? (bm === "landbank" ? "o " : "a ") : /^[aeiouyéèêh]/i.test(label) ? "l'" : "la ";
  if (muni >= 60) return translate("ci.market", lang, { city, market: marketOf(label, lang), suffix, tail });
  if (muni >= 50) return translate("ci.leans", lang, { city, la, label, suffix, tail });
  return translate("ci.noDominant", lang, { city, la, label, suffix, tail });
}

// 1 short sentence per mode, citing at least one real number from its KPI.
export function modeInsight(score: ModeScore, assetClass: string, lang: Lang): string {
  const m = score.mode;
  const kv = pillarValue(score.pillars, MODE_KPI[m].pillar);
  const suffix =
    assetClass === "residential"
      ? ""
      : translate("ins.suffixIn", lang, { cls: classLabelFor(assetClass, lang).toLowerCase() });
  if (kv == null)
    return translate("ins.mode.cityFallback", lang, { verdict: verdictDisplay(score.verdict, lang), suffix });
  const v = num(m, kv);
  switch (m) {
    case "promotion":
      return translate("ins.mode.promotion", lang, { v });
    case "detention":
      return translate("ins.mode.detention", lang, { v });
    case "arbitrage":
      return translate("ins.mode.arbitrage", lang, { v });
    case "landbank": {
      // Don't repeat the native indicator (constructibilité). Frame the reserve
      // by its best use + achievable value instead.
      const bu = score.pillars.find((p) => p.pillar === "valeur_meilleur_usage" && p.applicable);
      if (bu && typeof bu.native.value === "number") {
        // Le pilier valorisation a pour label "{usage} {prix} €/m²" (plus de
        // préfixe "meilleur usage") : l'usage est le premier token.
        const usage = /^(\S+)/.exec(bu.native.label)?.[1] ?? "mixte";
        return translate("ins.mode.landbankUse", lang, {
          usage,
          prix: Math.round(bu.native.value).toLocaleString("fr-FR"),
        });
      }
      return translate("ins.mode.landbankFallback", lang, { verdict: verdictDisplay(score.verdict, lang) });
    }
    default:
      return translate("ins.mode.default", lang, { verdict: verdictDisplay(score.verdict, lang), v });
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

// Accord PT de « promoção <classe> » (miroir de CLASS_ADJ_FR).
const CLASS_ADJ_PT: Record<string, string> = {
  residential: "residencial",
  office: "de escritórios",
  hotel: "hoteleira",
  logistics: "logística",
  retail: "comercial",
};

// Mot de mode par langue, utilisé dans les phrases « <mode> <classe> » de
// sectorPhrase. Landbank garde le mot d'usage (« landbank » dans les 3 langues).
const MODE_WORD: Record<Mode, { fr: string; en: string; pt: string }> = {
  promotion: { fr: "promotion", en: "development", pt: "promoção" },
  detention: { fr: "détention", en: "holding", pt: "detenção" },
  arbitrage: { fr: "arbitrage", en: "arbitrage", pt: "arbitragem" },
  landbank: { fr: "landbank", en: "landbank", pt: "landbank" },
};

// Phrase « <mode> <classe> » localisée, en minuscule (mid-phrase FR/PT) et en
// capitale (début de phrase EN). FR byte-identique à l'ancien `adj` préfixé du
// mot de mode. EN : « <classe> <mode> » (ex. « residential development »,
// « residential holding »).
function sectorPhrase(assetClass: string, lang: Lang, mode: Mode): { sector: string; Sector: string } {
  const s =
    lang === "en"
      ? `${classLabelFor(assetClass, "en").toLowerCase()} ${MODE_WORD[mode].en}`
      : lang === "pt"
      ? `${MODE_WORD[mode].pt} ${CLASS_ADJ_PT[assetClass] ?? classLabelFor(assetClass, "pt").toLowerCase()}`
      : `${MODE_WORD[mode].fr} ${CLASS_ADJ_FR[assetClass] ?? classLabel(assetClass).toLowerCase()}`;
  return { sector: s, Sector: cap(s) };
}

// "Name (30%)" list with a language-aware final conjunction (« et » / " and " / " e ").
function marginList(rows: PmRow[], lang: Lang): string {
  const parts = rows.map((r) => `${r.name} (${fmtNum(r.marginPct)}%)`);
  if (parts.length <= 1) return parts.join("");
  const and = lang === "en" ? " and " : lang === "pt" ? " e " : " et ";
  return parts.slice(0, -1).join(", ") + and + parts[parts.length - 1];
}

// 1-2 sentences: how many freguesias carry promotion, the 2-3 best (with margin),
// and why the rest doesn't pencil. Verb graded by the count of viable freguesias.
// `selectiveRest` : complément du gabarit « marché sélectif » (« de la capitale »
// à Lisbonne), fourni par le registre des villes ; défaut « de la ville ».
// `viableCount` : décompte autoritaire des viables (Go + Conditionnel) servi
// par le backend (verdict_counts, maille fine hors municipio) ; le texte ne
// recompte pas seul. Repli sur le comptage local des rows si absent.
export function priceMarginInsight(
  rows: PmRow[],
  assetClass: string,
  selectiveRest?: string,
  noun: ZoneNoun = FREG_NOUN,
  viableCount?: number,
  lang: Lang = "fr"
): string {
  if (!rows.length) return LOADING;
  const { sector, Sector } = sectorPhrase(assetClass, lang, "promotion");
  const viable = rows
    .filter((r) => verdictTone("promotion", r.verdict) !== "low")
    .sort((a, b) => b.marginPct - a.marginPct);
  const n = viableCount ?? viable.length;

  // Gabarit « marché sélectif » : quand les Conditionnel dépassent la moitié
  // des freguesias, « tient sur N » (Go + Conditionnel) serait mécaniquement
  // exact mais contradictoire avec une ligne marché sélective ; on ne compte
  // vraiment que les Go, le reste est sous conditions. Gaia (≤ 50% de
  // Conditionnel sur les 5 classes) reste sur le gabarit historique.
  const good = viable.filter((r) => verdictTone("promotion", r.verdict) === "good");
  const midCount = viable.length - good.length;
  if (good.length > 0 && midCount > rows.length / 2) {
    const list = marginList(good.slice(0, 3), lang);
    const head =
      good.length === 1
        ? translate("pm.selectiveOne", lang, { sector, Sector, sg: noun.sg, list })
        : translate("pm.selectiveN", lang, { sector, Sector, n: good.length, pl: noun.pl, list });
    return head + translate("pm.selectiveRest", lang, { selectiveRest: selectiveRest ?? translate("pm.restDefault", lang) });
  }

  if (n === 0) {
    const best = [...rows].sort((a, b) => b.marginPct - a.marginPct)[0];
    const tail = best ? translate("pm.noneTail", lang, { m: Math.round(best.marginPct), short: best.short }) : "";
    return translate("pm.none", lang, { sg: noun.sg, sector, Sector, tail });
  }
  // Closing clause computed on the non-viable set: pure loss vs thin/absorption.
  const nonViable = rows.filter((r) => verdictTone("promotion", r.verdict) === "low");
  const allNeg = nonViable.length > 0 && nonViable.every((r) => r.marginPct < 0);
  const why =
    nonViable.length === 0
      ? ""
      : allNeg
      ? translate("pm.whyLoss", lang)
      : translate("pm.whyThin", lang);
  const list = marginList(viable.slice(0, 3), lang);
  const head =
    n >= 3
      ? translate("pm.headN", lang, { sector, Sector, n, pl: noun.pl, list })
      : n === 2
      ? translate("pm.head2", lang, { sector, Sector, pl: noun.pl, list })
      : translate("pm.head1", lang, { sector, Sector, sg: noun.sg, list });
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

// "Name (3.5%)" list with a language-aware final conjunction (« et » / " and " /
// " e "). Le formatage du nombre (fmtNum, point décimal) reste inchangé.
function yieldList(rows: RdRow[], lang: Lang): string {
  const parts = rows.map((r) => `${r.name} (${fmtNum(r.yieldNet, 1)}%)`);
  if (parts.length <= 1) return parts.join("");
  const and = lang === "en" ? " and " : lang === "pt" ? " e " : " et ";
  return parts.slice(0, -1).join(", ") + and + parts[parts.length - 1];
}

// `keepCount` : décompte autoritaire des Conserver servi par le backend
// (verdict_counts, maille fine hors municipio) ; le texte ne recompte pas seul.
export function detentionInsight(
  rows: RdRow[],
  assetClass: string,
  trapClause?: string,
  noun: ZoneNoun = FREG_NOUN,
  keepCount?: number,
  lang: Lang = "fr"
): string {
  if (!rows.length) return LOADING;
  const { sector, Sector } = sectorPhrase(assetClass, lang, "detention");
  const suffix =
    assetClass === "residential"
      ? ""
      : translate("ins.suffixIn", lang, { cls: classLabelFor(assetClass, lang).toLowerCase() });
  const keep = rows
    .filter((r) => verdictTone("detention", r.verdict) === "good")
    .sort((a, b) => b.yieldNet - a.yieldNet);
  const n = keepCount ?? keep.length;

  // Signature message of the page: when the highest facial yield sits on a Céder
  // freguesia, name the inverted-yield trap explicitly.
  const maxY = rows.length ? rows.reduce((a, b) => (b.yieldNet > a.yieldNet ? b : a)) : null;
  const trap =
    maxY && verdictTone("detention", maxY.verdict) === "low"
      ? " " + (trapClause ?? translate("det.trapDefault", lang, { short: maxY.short, y: fmtNum(maxY.yieldNet, 1) }))
      : "";

  if (n === 0) {
    if (trap) return translate("det.noneTrap", lang, { sg: noun.sg, suffix, trap });
    const best = [...rows].sort((a, b) => b.yieldNet - a.yieldNet)[0];
    const tail = best ? translate("det.noneTail", lang, { y: fmtNum(best.yieldNet, 1), short: best.short }) : "";
    return translate("det.none", lang, { sg: noun.sg, suffix, tail });
  }
  // Closing clause: the yield trap when it applies, else the most common weakest
  // pillar across the non-Conserver set. `reason` n'est localisé que pour les 6
  // piliers connus (DET_CLAUSE) : tout autre `weakest` -> pas de clause (why="").
  let why = "";
  if (!trap) {
    const rest = rows.filter((r) => verdictTone("detention", r.verdict) !== "good");
    if (rest.length) {
      const counts = new Map<string, number>();
      for (const r of rest) if (r.weakest) counts.set(r.weakest, (counts.get(r.weakest) ?? 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const reason = top && DET_CLAUSE[top[0]] ? translate("det.clause." + top[0], lang) : undefined;
      if (reason) why = translate("det.whyRest", lang, { reason });
    }
  }
  const list = yieldList(keep.slice(0, 3), lang);
  const head =
    n >= 3
      ? translate("det.headN", lang, { sector, Sector, n, pl: noun.pl, list })
      : n === 2
      ? translate("det.head2", lang, { sector, Sector, pl: noun.pl, list })
      : translate("det.head1", lang, { sector, Sector, sg: noun.sg, list });
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

// "Name (+21%)" list with a language-aware final conjunction (« et » / " and " /
// " e "). Le formatage du nombre (pctSigned, signe inclus) reste inchangé.
function spreadList(rows: ArbRow[], lang: Lang): string {
  const parts = rows.map((r) => `${r.name} (${pctSigned(r.spreadPct, 0)})`);
  if (parts.length <= 1) return parts.join("");
  const and = lang === "en" ? " and " : lang === "pt" ? " e " : " et ";
  return parts.slice(0, -1).join(", ") + and + parts[parts.length - 1];
}

// `openCount` : décompte autoritaire des Fenêtre ouverte servi par le backend
// (verdict_counts, maille fine hors municipio) ; le texte ne recompte pas seul.
// À la différence des autres modes, 0 fenêtre ouverte EST un état de marché réel
// (ex. Porto) : le garde-fou ne porte que sur rows vide (données non chargées).
export function arbitrageInsight(
  rows: ArbRow[],
  assetClass: string,
  noun: ZoneNoun = FREG_NOUN,
  openCount?: number,
  lang: Lang = "fr"
): string {
  if (!rows.length) return LOADING;
  const suffix =
    assetClass === "residential"
      ? ""
      : translate("ins.suffixIn", lang, { cls: classLabelFor(assetClass, lang).toLowerCase() });
  const open = rows
    .filter((r) => verdictTone("arbitrage", r.verdict) === "good")
    .sort((a, b) => b.spreadPct - a.spreadPct);
  const n = openCount ?? open.length;

  // Signature message of the page: when the widest spread sits outside the open
  // windows, it is a paper spread: no institutional buyer, no window.
  const maxS = rows.length ? rows.reduce((a, b) => (b.spreadPct > a.spreadPct ? b : a)) : null;
  const trap =
    maxS && verdictTone("arbitrage", maxS.verdict) !== "good"
      ? " " + translate("arb.trapDefault", lang, { short: maxS.short, s: pctSigned(maxS.spreadPct, 0) })
      : "";

  if (n === 0) {
    if (trap) return translate("arb.noneTrap", lang, { suffix, trap });
    const best = [...rows].sort((a, b) => b.spreadPct - a.spreadPct)[0];
    const tail = best ? translate("arb.noneTail", lang, { s: pctSigned(best.spreadPct, 0), short: best.short }) : "";
    return translate("arb.none", lang, { suffix, tail });
  }
  // Closing clause: the paper-spread trap when it applies, else the most common
  // weakest pillar across the non-open set. `reason` n'est localisé que pour les
  // 5 piliers connus (ARB_CLAUSE) : tout autre `weakest` -> pas de clause.
  // La phrase de queue est partagée avec la détention (det.whyRest).
  let why = "";
  if (!trap) {
    const rest = rows.filter((r) => verdictTone("arbitrage", r.verdict) !== "good");
    if (rest.length) {
      const counts = new Map<string, number>();
      for (const r of rest) if (r.weakest) counts.set(r.weakest, (counts.get(r.weakest) ?? 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const reason = top && ARB_CLAUSE[top[0]] ? translate("arb.clause." + top[0], lang) : undefined;
      if (reason) why = translate("det.whyRest", lang, { reason });
    }
  }
  const list = spreadList(open.slice(0, 3), lang);
  const head =
    n >= 3
      ? translate("arb.headN", lang, { n, pl: noun.pl, suffix, list })
      : n === 2
      ? translate("arb.head2", lang, { pl: noun.pl, suffix, list })
      : translate("arb.head1", lang, { suffix, list });
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

// "Name (+47%)" list with a language-aware final conjunction (« et » / " and " /
// " e "). Le formatage du nombre (pctSigned, signe inclus) reste inchangé.
function upliftList(rows: FcRow[], lang: Lang): string {
  const parts = rows.map((r) => `${r.name} (${pctSigned(r.upliftPct, 0)})`);
  if (parts.length <= 1) return parts.join("");
  const and = lang === "en" ? " and " : lang === "pt" ? " e " : " et ";
  return parts.slice(0, -1).join(", ") + and + parts[parts.length - 1];
}

// `prioCount` : décompte autoritaire des Prioritaire servi par le backend
// (verdict_counts, maille fine hors municipio) ; le texte ne recompte pas seul.
export function landbankInsight(
  rows: FcRow[],
  noun: ZoneNoun = FREG_NOUN,
  prioCount?: number,
  lang: Lang = "fr"
): string {
  if (!rows.length) return LOADING;
  const prio = rows
    .filter((r) => verdictTone("landbank", r.verdict) === "good")
    .sort((a, b) => b.upliftPct - a.upliftPct);
  const n = prioCount ?? prio.length;

  // Signature message of the page: the most constructible freguesia is not the
  // most activatable when its market cannot absorb a programme.
  const maxC = rows.length ? rows.reduce((a, b) => (b.constructibilite > a.constructibilite ? b : a)) : null;
  const trap =
    maxC && verdictTone("landbank", maxC.verdict) !== "good"
      ? " " + translate("lb.trapDefault", lang, { short: maxC.short, c: Math.round(maxC.constructibilite) })
      : "";

  if (n === 0) {
    if (trap) return translate("lb.noneTrap", lang, { sg: noun.sg, trap });
    const best = [...rows].sort((a, b) => b.upliftPct - a.upliftPct)[0];
    const tail = best ? translate("lb.noneTail", lang, { u: pctSigned(best.upliftPct, 0), short: best.short }) : "";
    return translate("lb.none", lang, { sg: noun.sg, tail });
  }
  // Closing clause: the buildable-not-activatable trap when it applies, else the
  // most common weakest pillar across the non-priority set. `reason` n'est
  // localisé que pour les 5 piliers connus (LAND_CLAUSE) : tout autre `weakest`
  // -> pas de clause. La phrase de queue est partagée (det.whyRest).
  let why = "";
  if (!trap) {
    const rest = rows.filter((r) => verdictTone("landbank", r.verdict) !== "good");
    if (rest.length) {
      const counts = new Map<string, number>();
      for (const r of rest) if (r.weakest) counts.set(r.weakest, (counts.get(r.weakest) ?? 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const reason = top && LAND_CLAUSE[top[0]] ? translate("lb.clause." + top[0], lang) : undefined;
      if (reason) why = translate("det.whyRest", lang, { reason });
    }
  }
  const list = upliftList(prio.slice(0, 3), lang);
  const head =
    n >= 3
      ? translate("lb.headN", lang, { n, pl: noun.pl, list })
      : n === 2
      ? translate("lb.head2", lang, { pl: noun.pl, list })
      : translate("lb.head1", lang, { sg: noun.sg, list });
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

// Native metric phrase of a cell (« marge 30% », "margin 30%"), or the verdict
// when the mode has no native number. Clé de métrique par mode.
const CMP_METRIC_KEY: Record<Mode, string> = {
  promotion: "cmp.metric.margin",
  detention: "cmp.metric.netYield",
  arbitrage: "cmp.metric.spread",
  landbank: "cmp.metric.uplift",
};
function cellMetricPhrase(c: CompareModeCell, lang: Lang): string {
  if (c.metric == null) return verdictDisplay(c.verdict, lang);
  const x =
    c.mode === "promotion"
      ? fmtNum(c.metric)
      : c.mode === "detention"
      ? fmtNum(c.metric, 1)
      : pctSigned(c.metric, 0);
  return translate(CMP_METRIC_KEY[c.mode], lang, { x });
}

// One-line dominant signal for a freguesia: its best mode with the native
// number, the two runners-up as prose. Ex: "Profil promotion : marge 30%,
// le foncier et la détention suivent."
export function compareInsight(cells: CompareModeCell[], lang: Lang = "fr"): string {
  if (!cells.length) return "";
  const ranked = [...cells].sort((a, b) => b.total - a.total);
  const best = ranked[0];
  const followers = ranked.slice(1, 3).map((c) => translate("cmp.prose." + c.mode, lang));
  const and = lang === "en" ? " and " : lang === "pt" ? " e " : " et ";
  const tail = followers.length ? translate("cmp.tail", lang, { followers: followers.join(and) }) : "";
  const Mode = modeLabel(best.mode, lang);
  return translate("cmp.profile", lang, {
    mode: Mode.toLowerCase(),
    Mode,
    metric: cellMetricPhrase(best, lang),
    tail,
  });
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
    case "promotion": return ` (${fmtNum(win.metric)}% vs ${fmtNum(run.metric)}%)`;
    case "detention": return ` (${fmtNum(win.metric, 1)}% vs ${fmtNum(run.metric, 1)}%)`;
    default: return ` (${pctSigned(win.metric, 0)} vs ${pctSigned(run.metric, 0)})`;
  }
}

// Grammaire de liaison de la synthèse : préposition de mode (« en » / "in" /
// « em »), conjonction finale et séparateur de propositions (le FR met une
// espace fine avant le point-virgule, pas l'EN ni le PT).
const CMP_GRAM = {
  fr: { prep: "en", conj: "et", sep: " ; " },
  en: { prep: "in", conj: "and", sep: "; " },
  pt: { prep: "em", conj: "e", sep: "; " },
} as const;

// One sentence: who wins which mode, with the numbers on each winner's leading
// mode. Ex: "Santa Marinha domine en promotion (30% vs 29%), en détention et en
// arbitrage ; Madalena prend l'avantage en valeur résiduelle foncière (874 vs
// 814 €/m²)."
export function compareSynthesis(cols: CompareColumn[], lang: Lang = "fr"): string {
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
  const gram = CMP_GRAM[lang];
  const verbs = [translate("cmp.verb0", lang), translate("cmp.verb1", lang), translate("cmp.verb2", lang)];
  const parts: string[] = [];
  const order = [...wins.entries()].sort((a, b) => b[1].length - a[1].length);
  order.forEach(([colIdx, modes], k) => {
    const names = modes.map(
      (w, j) => translate("cmp.vs." + w.mode, lang) + (j === 0 ? vsPhrase(w.mode, w.win, w.run) : "")
    );
    const list =
      names.length > 1
        ? names.slice(0, -1).join(`, ${gram.prep} `) + ` ${gram.conj} ${gram.prep} ` + names[names.length - 1]
        : names[0];
    parts.push(`${cols[colIdx].short} ${verbs[Math.min(k, verbs.length - 1)]} ${gram.prep} ${list}`);
  });
  return parts.length ? parts.join(gram.sep) + "." : "";
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
export function anomalyNote(mode: Mode, scores: ModeScore[], lang: Lang = "fr"): string | null {
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
  // `weak` est déjà garanti dans PILLAR_REASON par le .filter ci-dessus : la
  // whitelist reste la source de vérité, an.pillar.* n'en est que le rendu.
  const reason = weak ? translate("an.pillar." + weak.pillar, lang) : translate("an.reasonFallback", lang);
  const metric =
    mode === "promotion" ? translate("an.metric.promotion", lang, { v: fmtNum(v) })
    : mode === "detention" ? translate("an.metric.detention", lang, { v: fmtNum(v, 1) })
    : mode === "arbitrage" ? translate("an.metric.arbitrage", lang, { s: pctSigned(v, 0) })
    : translate("an.metric.landbank", lang, { c: Math.round(v) });
  return translate("an.sentence", lang, {
    name: displayName(s.zone_name),
    metric,
    reason,
    verdict: verdictDisplay(s.verdict, lang),
  });
}

/* ------------------------------------------------------------------ */
/* Trajectoire des prix (Vue d'ensemble) : insight déterministe        */
/* ------------------------------------------------------------------ */

// "Le prix <classe> de Gaia…" : noun-complement per class (masculine "prix").
// One sentence under the trajectory title: 12-month move + shape of the recent
// year (second-half acceleration / steady / easing), computed from the series
// itself, no free text. Pure, no JSX.
export function trendInsight(
  points: { t: string; price: number }[],
  yoyPct: number | null,
  assetClass: string,
  cityName: string = "Gaia",
  lang: Lang
): string {
  if (points.length < 8 || yoyPct == null) return translate("ins.trend.loading", lang);
  const of = translate("ins.priceOf." + assetClass, lang);
  const x = Math.abs(yoyPct).toFixed(1);
  const xLoc = lang === "en" ? x : x.replace(".", ",");
  const move = yoyPct >= 0 ? translate("ins.trend.up", lang, { x: xLoc }) : translate("ins.trend.down", lang, { x: xLoc });
  // Last 12 months split in halves: t3→t5 vs t5→t7 (growth in %).
  const h1 = (points[5].price / points[3].price - 1) * 100;
  const h2 = (points[7].price / points[5].price - 1) * 100;
  const shape =
    h2 > h1 + 1 ? translate("ins.trend.accel", lang)
    : h2 < h1 - 1 ? translate("ins.trend.slow", lang)
    : translate("ins.trend.steady", lang);
  return translate("ins.trend.sentence", lang, { of, city: cityName, move, shape });
}
