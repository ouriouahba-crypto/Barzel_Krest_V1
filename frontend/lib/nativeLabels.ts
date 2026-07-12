// Recomposition des libelles NATIFS du moteur depuis les champs STRUCTURES du
// payload (native.value / native.unit / breakdown), pour que rien du francais
// emis par mode_scoring.py n'atteigne l'ecran en EN/PT.
//
// CONTRAT DUR : en FR, ces fonctions rendent la chaine du moteur A L'OCTET.
// Le moteur reste la reference (il continue d'emettre ses labels FR pour le PDF
// et les tests) : ici on ne fait que la REJOUER, jamais la redefinir. Tout
// pilier qu'on ne sait pas rejouer a l'identique retourne null -> l'appelant
// retombe sur le label moteur (fallback sur, jamais de texte invente).
//
// Fallback assume (le seul restant apres NATIFS-2) :
//   risque_energie : le label « MEPS F/G ~2030-2033 » tient dans min_label +
//     deadline, deux champs ABSENTS du payload (native.value porte le risque).
//     La chaine etant deja LANGUE-NEUTRE (sigle + lettres de classe + annees),
//     on la laisse passer telle quelle : aucun mot francais n'en sort.

import type { Lang } from "./i18n";
import { translate } from "./i18n";
import { fmtNumber } from "./i18n/format";
import type { ModeScore, Pillar, PillarNative } from "./api";
import type { Mode } from "./scoring";
import { fmtNum, fmtSigned } from "./scoring";

// --- Classes : le moteur ecrit la classe en FRANCAIS (valeur_meilleur_usage,
// breakdown.meilleur_usage, breakdown.usages[*].label). On remonte a la cle
// canonique, puis on traduit. Les cles nat.cls.* sont DEDIEES : class.* ne
// convient pas (son FR dit « Hôtellerie » la ou le moteur dit « hôtel »).
export const CLS_FROM_FR: Record<string, string> = {
  "résidentiel": "residential",
  "bureaux": "office",
  "hôtel": "hotel",
  "logistique": "logistics",
  "commerce": "retail",
};

// Classe canonique -> libelle natif traduit (FR byte-identique au moteur).
export function natClassLabel(canonical: string, lang: Lang): string {
  return translate(`nat.cls.${canonical}`, lang);
}

// Mot d'usage FRANCAIS du moteur -> libelle traduit. Cle inconnue -> « mixte ».
export function natUsageFromFr(frWord: string, lang: Lang): string {
  const canonical = CLS_FROM_FR[frWord];
  return canonical ? natClassLabel(canonical, lang) : translate("nat.cls.mixed", lang);
}

// Horizon d'activation (landbank) : 3 valeurs FR emises par score_mode.
const HORIZON_KEY: Record<string, string> = {
  "immédiat": "nat.horizon.immediat",
  "2-4 ans": "nat.horizon.2a4ans",
  "au-delà": "nat.horizon.audela",
};
export function natHorizon(fr: string, lang: Lang): string {
  const k = HORIZON_KEY[fr];
  return k ? translate(k, lang) : fr;
}

// Appetit institutionnel en mot gradue (miroir de _appetit_qual : 0.7 / 0.4).
export function natAppetitQual(value: PillarNative["value"], lang: Lang): string | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  const k = value >= 0.7 ? "nat.appetitHigh" : value >= 0.4 ? "nat.appetitMid" : "nat.appetitLow";
  return translate(k, lang);
}

// --- Rendu numerique ---------------------------------------------------------
// Plusieurs labels du moteur impriment la valeur BRUTE (le str() python du
// parametre), et JSON DETRUIT l'information int/float : le moteur ecrit
// « sortie 4.0% » (float python) la ou JSON.parse rend 4, que JS re-serialise
// en « 4 ». Impossible a deviner depuis native.value.
//
// On relit donc le NOMBRE TEL QU'IL EST ECRIT dans le label moteur. Ce sont des
// CHIFFRES : langue-neutre, aucun mot francais ne ressort. Seul le mot est
// traduit. C'est la seule facon de rester byte-identique en FR (Bruxelles :
// « sortie 4.0% ») sans laisser fuiter « sortie » en EN.
//
// Constate au controle : exit_cgt_pct vaut 21 (int) en PT et 4.0 (float) en BE.
function rawToken(label: string | undefined): string | null {
  const m = /(-?\d+(?:\.\d+)?)/.exec(label ?? "");
  return m ? m[1] : null;
}
// Valeur brute : le token du label si present, sinon la valeur servie.
function raw(p: Pillar): string | null {
  const tok = rawToken(p.native.label);
  if (tok !== null) return tok;
  const v = p.native.value;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "string" && v.length > 0) return v;
  return null;
}
const num = (v: PillarNative["value"]): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

// Valeur €/m² du pilier valorisation : le moteur n'a PAS de separateur de
// milliers (str() d'un int python). En FR on le rejoue a l'octet ; en EN/PT on
// applique le separateur localise, conformement a la convention de la
// plateforme (lib/i18n/format.ts).
function eurValue(v: number, lang: Lang): string {
  return lang === "fr" ? String(v) : fmtNumber(Math.round(v), lang);
}

/**
 * Libelle natif d'un pilier, recompose depuis native.value / native.unit.
 * Retourne null quand le pilier n'est pas rejouable a l'identique : l'appelant
 * doit alors retomber sur p.native.label (le label moteur).
 */
export function composePillarNative(p: Pillar, lang: Lang): string | null {
  if (!p.applicable) return null;
  const v = p.native.value;
  const n = num(v);

  switch (p.pillar) {
    case "marge":
      return n == null ? null : translate("nat.marge", lang, { v: fmtNum(n, 0) });
    case "absorption":
      return n == null ? null : translate("nat.absorption", lang, { v: n.toFixed(1) });
    case "momentum_prix":
      return n == null ? null : translate("nat.momentum", lang, { v: fmtSigned(n, 1) });
    case "constructibilite": {
      const r = raw(p);
      return r == null ? null : translate("nat.constructibilite", lang, { v: r });
    }
    case "risque_sortie":
      return n == null ? null : translate("nat.risqueSortie", lang, { v: fmtNum(n, 0) });
    case "profondeur_locative":
      return n == null ? null : translate("nat.profondeur", lang, { v: fmtNum(n, 0) });
    case "rendement_net":
      return n == null ? null : translate("nat.yieldNet", lang, { v: fmtNum(n, 1) });
    case "resilience":
      return n == null ? null : translate("nat.resilience", lang, { v: fmtNum(n, 0) });
    case "portage": {
      const r = raw(p);
      return r == null ? null : translate("nat.wacc", lang, { v: r });
    }
    case "spread":
      return n == null ? null : translate("nat.spread", lang, { v: fmtNum(n, 0) });
    case "appetit_institutionnel": {
      const r = raw(p);
      return r == null ? null : translate("nat.appetit", lang, { v: r });
    }
    case "momentum_cycle": {
      // Deux variantes selon l'unite servie : yoy (%) ou cycle parametre (/100).
      if (p.native.unit === "%") {
        return n == null ? null : translate("nat.momentum", lang, { v: fmtSigned(n, 1) });
      }
      const r = raw(p);
      return r == null ? null : translate("nat.cycle", lang, { v: r });
    }
    case "frictions_sortie": {
      const r = raw(p);
      return r == null ? null : translate("nat.sortie", lang, { v: r });
    }
    case "cout_opportunite": {
      const r = raw(p);
      return r == null ? null : translate("nat.coc", lang, { v: r });
    }
    case "connectivite": {
      const r = raw(p);
      return r == null ? null : translate("nat.connectivite", lang, { v: r });
    }
    case "incitations":
      return n == null ? null : translate("nat.incitations", lang, { v: fmtNum(n, 0) });
    case "risque_timing": {
      const r = raw(p);
      return r == null ? null : translate("nat.risqueTiming", lang, { v: r });
    }
    case "valeur_meilleur_usage": {
      // La classe n'existe QUE comme mot francais dans le label moteur : on la
      // recupere par son premier token, on la remonte a la cle canonique, on
      // traduit. C'est la seule lecture residuelle du label moteur, et elle ne
      // sert qu'a retrouver une CLE (aucun mot FR ne ressort).
      if (n == null) return null;
      const frWord = /^(\S+)/.exec(p.native.label ?? "")?.[1];
      if (!frWord || !CLS_FROM_FR[frWord]) return null;
      return translate("nat.valeurUsage", lang, {
        cls: natUsageFromFr(frWord, lang),
        v: eurValue(n, lang),
      });
    }
    case "fiscalite": {
      // « acq 7.8% + détention 0.4%/an ». Les deux taux ne sont PAS dans le
      // payload : native.value ne porte que le burden composite (acq + 10 x
      // detention), une equation a deux inconnues, non inversible. On extrait
      // donc les deux nombres du label moteur : ce sont des CHIFFRES,
      // langue-neutres, repris TELS QUELS (aucun reformatage, ce qui garantit
      // l'identite FR et neutralise le piege int/float du JSON : le moteur sert
      // « 0.4 » ici et « 0.36 » ailleurs). Seuls les mots sont traduits.
      const m = /acq\s*(-?[\d.]+)%\s*\+\s*détention\s*(-?[\d.]+)%/.exec(p.native.label ?? "");
      if (!m) return null; // parse rate -> label moteur (aucun mot FR ne peut fuir)
      return translate("nat.fiscalite", lang, { a: m[1], b: m[2] });
    }
    // Non rejouable : les champs manquent au payload (cf. en-tete). Deja neutre.
    case "risque_energie":
      return null;
    default:
      return null;
  }
}

/** Segment d'un pilier : recompose, sinon label moteur (l'indicateur reste complet). */
function segment(p: Pillar | undefined, lang: Lang): string | null {
  if (!p || !p.applicable) return null;
  return composePillarNative(p, lang) ?? p.native.label ?? null;
}

/**
 * Indicateur natif combine (miroir de _native_indicator) : join " · ",
 * fallback "–". Retourne null si le score n'a aucun pilier exploitable.
 */
export function composeNativeIndicator(score: ModeScore, mode: Mode, lang: Lang): string | null {
  const by = (k: string) => score.pillars?.find((p) => p.pillar === k);
  if (!score.pillars) return null;

  let parts: (string | null)[];
  switch (mode) {
    case "promotion":
      parts = [segment(by("marge"), lang), segment(by("absorption"), lang)];
      break;
    case "detention":
      parts = [segment(by("rendement_net"), lang), segment(by("risque_energie"), lang)];
      break;
    case "arbitrage": {
      // L'indicateur n'utilise PAS le label du pilier appetit, mais sa forme
      // qualitative graduee.
      const ap = by("appetit_institutionnel");
      const qual = ap && ap.applicable ? natAppetitQual(ap.native.value, lang) : null;
      parts = [segment(by("spread"), lang), qual];
      break;
    }
    case "landbank": {
      const bu = by("valeur_meilleur_usage");
      const buSeg = segment(bu, lang);
      parts = [
        segment(by("constructibilite"), lang),
        buSeg ? `${translate("nat.maxValuation", lang)}${buSeg}` : null,
      ];
      break;
    }
    default:
      return null;
  }

  const kept = parts.filter((s): s is string => !!s && s !== "n/a");
  return kept.length ? kept.join(" · ") : "–";
}

// ---------------------------------------------------------------------------
// WHY : la phrase d'explication sous chaque barre de pilier (DetailPanel, page
// Carte). Meme doctrine que les libelles natifs : on REJOUE la chaine du moteur,
// on ne la redefinit pas.
//
// Les NOMBRES sont repris VERBATIM depuis p.why par regex. Ce sont des chiffres,
// langue-neutres : ca garantit l'identite FR a l'octet ET ca neutralise les
// pieges de formatage du moteur (:.0f / :.1f / :.2f / str() brut, ou l'info
// int/float est detruite par JSON). Seuls les MOTS sont traduits.
//
// Un regex qui ne matche pas -> null -> l'appelant retombe sur p.why : aucun mot
// francais ne peut fuir par une forme non prevue.
//
// NON TRAITES ICI (lot 3b, gabarits VARIABLES a fragments optionnels) :
//   marge, risque_sortie, profondeur_locative, momentum_cycle, risque_energie.
// ---------------------------------------------------------------------------

// Le moteur ecrit « − » U+2212 (signe moins), PAS un tiret ASCII : on le rejoue.
const MINUS = "−";

// Les 3 notes alternatives de momentum_prix (mode_scoring.py:922-942). Chaine
// FR exacte -> cle ; toute autre note -> null (fallback).
const MOM_NOTE: Record<string, string> = {
  " (écrêté: signe de surchauffe)": "wy.mom.overheat",
  " (plancher de régénération : nouveau terminal intermodal et plan-guide de reconversion soutiennent le momentum de promotion malgré le yoy consolidé)":
    "wy.mom.regen",
};

// incitations : prose libre venant de params.json, non reconstructible depuis la
// structure. Table finie des 2 chaines connues (PT, BE) ; une 3e -> null.
const INCIT: Record<string, string> = {
  "incitations 2026: IVA 6% construction abordable, exoneration IMT/IS sous plafonds, exoneration AIMI, contrats CIA":
    "wy.incit.pt",
  "incitations 2026: abattement 200k eur, primes renovation": "wy.incit.be",
};

/**
 * Phrase `why` d'un pilier, recomposee et traduite.
 * Retourne null quand la forme n'est pas couverte : l'appelant retombe sur p.why.
 */
export function composeWhy(p: Pillar, lang: Lang, score?: ModeScore): string | null {
  if (!p.applicable) return null;
  const w = p.why ?? "";
  const T = (k: string, v?: Record<string, string>) => translate(k, lang, v);
  let m: RegExpExecArray | null;

  switch (p.pillar) {
    case "absorption": {
      // 2 formes : la clause « , profondeur {n} ventes/an » est conditionnee a
      // n_transactions (mode_scoring.py:912). Deterministe, pas variable.
      m = /^absorption ~(-?[\d.]+) mois \(DOM médian simulé\)(?:, profondeur (\d+) ventes\/an)?$/.exec(w);
      if (!m) return null;
      return m[2] !== undefined
        ? T("wy.absorption", { v: m[1], n: m[2] })
        : T("wy.absorptionShort", { v: m[1] });
    }
    case "momentum_prix": {
      m = /^momentum prix ([+-]?[\d.]+)%(.*)$/s.exec(w);
      if (!m) return null;
      const rawNote = m[2];
      let note = "";
      if (rawNote) {
        const k = MOM_NOTE[rawNote];
        if (!k) return null; // note inconnue -> fallback, jamais de FR fuite
        note = T(k);
      }
      return T("wy.momentumPrix", { v: m[1], note });
    }
    case "constructibilite":
      m = /^constructibilité (-?[\d.]+)\/100 \(percentile socle\)$/.exec(w);
      return m ? T("wy.constructibilite", { v: m[1] }) : null;
    case "connectivite":
      m = /^connectivité (-?[\d.]+)\/100 \(percentile socle\)$/.exec(w);
      return m ? T("wy.connectivite", { v: m[1] }) : null;
    case "portage":
      m = /^coût de portage (-?[\d.]+)%\/an \(dette senior \+ fonds propres, LTV cible\)$/.exec(w);
      return m ? T("wy.portage", { v: m[1] }) : null;
    case "frictions_sortie":
      m = /^frictions de sortie: plus-value\/friction (-?[\d.]+)%$/.exec(w);
      return m ? T("wy.frictions", { v: m[1] }) : null;
    case "cout_opportunite":
      m = /^coût d'opportunité du capital (-?[\d.]+)%$/.exec(w);
      return m ? T("wy.coc", { v: m[1] }) : null;
    case "risque_timing":
      m = /^risque de timing réglementaire (-?[\d.]+)\/100$/.exec(w);
      return m ? T("wy.risqueTiming", { v: m[1] }) : null;
    case "spread": {
      // 2 branches servies aux zones. Les branches « spread actif (paramètre
      // KREST) » et « dispersion Q75/Q50 » ne passent pas par le panneau Carte
      // (il rend le score de ZONE) : non couvertes -> fallback.
      m = /^spread zone ([+-]?[\d.]+)% \(médiane (-?[\d.]+) vs comparable (-?[\d.]+) €\/m²\)$/.exec(w);
      if (m) return T("wy.spreadZone", { v: m[1], a: m[2], b: m[3] });
      m = /^spread ([+-]?[\d.]+)% \(positionnement vs médiane ville\)$/.exec(w);
      return m ? T("wy.spreadPosition", { v: m[1] }) : null;
    }
    case "appetit_institutionnel": {
      // Le moteur ecrit la classe CANONIQUE ANGLAISE (« appétit institutionnel
      // retail 0.5 ») : un mot anglais dans l'UI francaise. On le REPARE (delta
      // FR assume) en passant par nat.cls.*.
      m = /^appétit institutionnel (\w+) (-?[\d.]+)$/.exec(w);
      if (!m) return null;
      const key = `nat.cls.${m[1]}`;
      const cls = translate(key, lang);
      if (cls === key) return null; // classe inconnue -> fallback
      return T("wy.appetit", { cls, v: m[2] });
    }
    case "valeur_meilleur_usage": {
      // Ici la classe est en FRANCAIS dans le why : on la remonte a sa cle
      // canonique (CLS_FROM_FR) avant de traduire.
      m = /^valorisation max: (\S+) ~(-?[\d.]+) €\/m² \(max multi-usages\)$/.exec(w);
      if (!m || !CLS_FROM_FR[m[1]]) return null;
      return T("wy.valeurUsage", { cls: natUsageFromFr(m[1], lang), v: m[2] });
    }
    case "rendement_net": {
      // « vacance » est absente du payload et « charges » n'en est pas derivable :
      // extraction des 4 nombres. Le separateur est U+2212.
      m = new RegExp(
        `^rendement net (-?[\\d.]+)% \\(brut (-?[\\d.]+)% ${MINUS} fisc (-?[\\d.]+) ${MINUS} charges (-?[\\d.]+) ${MINUS} vacance (-?[\\d.]+)%\\)$`
      ).exec(w);
      return m ? T("wy.rendementNet", { v: m[1], a: m[2], b: m[3], c: m[4], d: m[5] }) : null;
    }
    case "resilience":
      // connectivite + vacance absentes du payload detention : extraction.
      m = /^résilience locative (-?[\d.]+)\/100 \(connectivité (-?[\d.]+), vacance (-?[\d.]+)%\)$/.exec(w);
      return m ? T("wy.resilience", { v: m[1], a: m[2], b: m[3] }) : null;
    case "fiscalite":
      // native.value ne porte que le burden composite : extraction des 2 taux.
      m = /^charge fiscale détention \(droits (-?[\d.]+)%, annuel (-?[\d.]+)%\)$/.exec(w);
      return m ? T("wy.fiscalite", { a: m[1], b: m[2] }) : null;
    case "incitations": {
      const k = INCIT[w];
      return k ? T(k) : null;
    }
    // Lot 3b : gabarits VARIABLES (fragments optionnels, joins dynamiques).
    case "marge":
    case "risque_sortie":
    case "profondeur_locative":
    case "momentum_cycle":
    case "risque_energie":
      return null;
    default:
      return null;
  }
}
