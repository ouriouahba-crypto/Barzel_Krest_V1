// Point d'entree de l'i18n : langue par defaut, liste des langues (endonymes) et
// table des dictionnaires. Architecture N-langues : ajouter une langue = un code
// dans `Lang` (types.ts), une entree ici dans LANGS et dicts, un fichier <code>.ts.

import type { Lang, Dict } from "./types";
import { en } from "./en";
import { fr } from "./fr";
import { pt } from "./pt";

export const DEFAULT_LANG: Lang = "en";

export const LANGS: { code: Lang; endonym: string }[] = [
  { code: "en", endonym: "English" },
  { code: "fr", endonym: "Français" },
  { code: "pt", endonym: "Português" },
];

export const dicts: Record<Lang, Dict> = { en, fr, pt };

export type { Lang, Dict } from "./types";
