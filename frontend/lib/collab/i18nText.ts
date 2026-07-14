// Résolution des champs texte de la couche collaborative (lot i18n QA-1a).
//
// LE POINT CLÉ DU LOT : un même champ (`Message.text`, `Thread.title`,
// `ActivityItem.text`, `FeedItem.date`…) transporte DEUX natures de valeur :
//   1) une CLÉ de dictionnaire pour le contenu seedé (« cs.gaia.t1.title ») ;
//   2) du TEXTE LIBRE pour ce que l'utilisateur crée en session (une réponse
//      tapée, un titre de fil, une info publiée) : ce texte ne sera JAMAIS dans
//      un dictionnaire, il doit s'afficher tel quel.
//
// `resolveText` distingue les deux : elle ne traduit que ce qui a la FORME d'une
// clé du projet (col.* / cs.*, sans espace). Tout le reste est rendu verbatim.
// On aurait pu appeler `t()` partout (il retombe déjà sur la clé brute quand elle
// est absente, donc une saisie s'afficherait quand même) ; le garde est préféré
// pour deux raisons : il évite d'avertir « missing key » en dev sur chaque saisie
// et chaque nom propre, et il empêche qu'une saisie ressemblant à une clé se
// fasse traduire à l'insu de l'utilisateur.
//
// Les NOMS PROPRES restés en donnée (libellés d'ancre « Haya Towers · Afurada »,
// noms de mailles, sources de presse) passent par la même porte et sortent
// inchangés : ils ne matchent pas la forme d'une clé.

import { modeLabel, verdictDisplay } from "@/lib/i18n/domain";
import type { Lang } from "@/lib/i18n/types";
import type { Anchor } from "./types";

/** Forme d'une clé i18n de la couche collab : préfixe col./cs., pas d'espace. */
const KEY_RE = /^(?:col|cs)\.[A-Za-z0-9_.-]+$/;

export function isI18nKey(value: string): boolean {
  return KEY_RE.test(value);
}

/** Traduit `value` si c'est une clé ; sinon la rend telle quelle (saisie, nom propre). */
export function resolveText(
  t: (key: string, params?: Record<string, string | number>) => string,
  value: string,
  params?: Record<string, string | number>,
): string {
  return isI18nKey(value) ? t(value, params) : value;
}

/**
 * Libellé D'AFFICHAGE d'une ancre (lot QA-1d). Point de passage unique de tous les
 * consommateurs (chip, popover de signalement, compositeur, titre d'un fil ouvert
 * par signalement) :
 *   - ancre de VERDICT : composée des clés canoniques via les helpers métier
 *     existants (`modeLabel` · `verdictDisplay`) : « Promotion · Céder » en FR,
 *     « Hold · Sell » en EN, « Detenção · Vender » en PT. Aucune clé i18n nouvelle.
 *   - ancre nommée : son libellé (nom propre verbatim, ou clé col.* traduite).
 */
export function anchorText(
  t: (key: string, params?: Record<string, string | number>) => string,
  lang: Lang,
  anchor: Anchor,
): string {
  return anchor.kind === "verdict"
    ? `${modeLabel(anchor.mode, lang)} · ${verdictDisplay(anchor.verdict, lang)}`
    : resolveText(t, anchor.label);
}
