// Tables d'affichage des libelles de PAYS et de VILLE, par langue. Decision
// verrouillee : ces libelles se traduisent A L'AFFICHAGE ici, SANS toucher
// cities.ts (COUNTRY_LABEL et city.label restent canoniques, ils servent a de la
// logique ailleurs). Repli : slug capitalise si inconnu.

import type { Lang } from "./types";
import type { CountryCode } from "@/lib/cities";

const COUNTRY_DISPLAY: Record<CountryCode, Record<Lang, string>> = {
  pt: { en: "Portugal", fr: "Portugal", pt: "Portugal" },
  be: { en: "Belgium", fr: "Belgique", pt: "Bélgica" },
};

const CITY_DISPLAY: Record<string, Record<Lang, string>> = {
  gaia: { en: "Vila Nova de Gaia", fr: "Vila Nova de Gaia", pt: "Vila Nova de Gaia" },
  lisbonne: { en: "Lisbon", fr: "Lisbonne", pt: "Lisboa" },
  porto: { en: "Porto", fr: "Porto", pt: "Porto" },
  bruxelles: { en: "Brussels", fr: "Bruxelles", pt: "Bruxelas" },
};

export function countryDisplay(code: CountryCode, lang: Lang): string {
  return COUNTRY_DISPLAY[code]?.[lang] ?? code;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function cityDisplay(slug: string, lang: Lang): string {
  return CITY_DISPLAY[slug]?.[lang] ?? capitalize(slug);
}
