// Formatage localise des nombres : SEPARATEUR DE MILLIERS uniquement (euros,
// €/m², prix, valeurs de barème). fr-FR espace insecable etroit (U+202F),
// en-GB virgule, pt-PT espace insecable (U+00A0).
//
// Les DECIMALES du scoring ne passent PAS par ici : fmtNum/fmtSigned/pctSigned
// (lib/scoring.ts) gardent leur point decimal, identique dans les 3 langues.
// C'est un choix assume : seules les pages Fiscalite formatent une decimale
// localisee (pctFR de lib/fiscal.ts et lib/fiscalBE.ts).

import type { Lang } from "./types";

const LOCALE: Record<Lang, string> = { en: "en-GB", fr: "fr-FR", pt: "pt-PT" };

export function localeFor(lang: Lang): string {
  return LOCALE[lang] ?? "en-GB";
}

// useGrouping "always" : pt-PT ne groupe PAS les nombres de 4 chiffres par
// defaut (minimumGroupingDigits = 2 → "3018"). On force le groupe pour rendre
// « 3 018 €/m² » comme en fr et en en. Sans effet sur fr-FR et en-GB (leur
// minimumGroupingDigits vaut 1) : le rendu FR reste identique a l'octet.
export function fmtNumber(v: number, lang: Lang, opts?: Intl.NumberFormatOptions): string {
  return v.toLocaleString(localeFor(lang), { useGrouping: "always", ...opts });
}
