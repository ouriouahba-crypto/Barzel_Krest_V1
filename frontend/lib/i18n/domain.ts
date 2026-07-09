// Couche d'affichage METIER lang-aware (lot i18n-1a) : modes, classes, verdicts,
// libelles KPI. Helpers purs (parametre `lang`, aucun hook) lisant `dicts`.
//
// Decision verrouillee : ces libelles se traduisent A L'AFFICHAGE ici ; les CLES
// CANONIQUES du moteur (modes "promotion"..., classes "residential"..., verdicts
// ASCII "Go"/"Conserver"/"Fenetre ouverte"...) restent inchangees et servent aux
// comparaisons, a verdictTone/verdictColor et aux payloads API. lib/i18n
// n'importe scoring.ts qu'en `import type` (Mode) : aucun cycle a l'execution.

import { dicts, DEFAULT_LANG } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n/types";
import type { Mode } from "@/lib/scoring";

// Valeurs canoniques de classe (jamais traduites : cles moteur/API).
const CLASS_VALUES = ["residential", "office", "hotel", "logistics", "retail"] as const;

export function modeLabel(mode: Mode, lang: Lang): string {
  const key = "mode." + mode;
  return dicts[lang]?.[key] ?? dicts[DEFAULT_LANG][key] ?? mode;
}

export function classLabelFor(value: string, lang: Lang): string {
  const key = "class." + value;
  return dicts[lang]?.[key] ?? dicts[DEFAULT_LANG][key] ?? value;
}

export function assetClassesFor(lang: Lang): { value: string; label: string }[] {
  return CLASS_VALUES.map((value) => ({ value, label: classLabelFor(value, lang) }));
}

export function kpiLabelFor(mode: Mode, lang: Lang): string {
  const key = "kpi." + mode;
  return dicts[lang]?.[key] ?? dicts[DEFAULT_LANG][key] ?? mode;
}

// Titre de pilier lang-aware (lot i18n-1c). Repli identique a pillarTitle
// (scoring.ts) : cle inconnue -> key.replace("_"," "). scoring.ts reste inchange.
export function pillarLabelFor(key: string, lang: Lang): string {
  const k = "pillar." + key;
  return dicts[lang]?.[k] ?? dicts[DEFAULT_LANG][k] ?? key.replace(/_/g, " ");
}

// Verdict : l'entree peut arriver accentuee ("Ceder"->"Céder", "A phaser"->"À
// phaser", "Fenetre ouverte"->"Fenêtre ouverte") ou en ASCII moteur. On
// canonicalise (retrait des diacritiques U+0300-U+036F) avant lookup, repli sur
// l'entree brute si la cle est inconnue (jamais vide).
export function verdictDisplay(verdict: string, lang: Lang): string {
  const canon = verdict.normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
  const key = "verdict." + canon;
  return dicts[lang]?.[key] ?? dicts[DEFAULT_LANG][key] ?? verdict;
}
