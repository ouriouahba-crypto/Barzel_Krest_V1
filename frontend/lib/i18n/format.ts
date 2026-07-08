// Formatage localise des nombres, fourni pour les lots suivants (migration des
// toLocaleString existants). NON utilise ailleurs dans ce lot.

import type { Lang } from "./types";

const LOCALE: Record<Lang, string> = { en: "en-GB", fr: "fr-FR", pt: "pt-PT" };

export function localeFor(lang: Lang): string {
  return LOCALE[lang] ?? "en-GB";
}

export function fmtNumber(v: number, lang: Lang, opts?: Intl.NumberFormatOptions): string {
  return v.toLocaleString(localeFor(lang), opts);
}
