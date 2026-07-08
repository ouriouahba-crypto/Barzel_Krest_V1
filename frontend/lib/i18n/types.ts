// Types de base de l'i18n. Architecture N-langues : `Lang` s'etend en ajoutant
// un code ici et un dictionnaire dans `dicts` (index.ts). Un `Dict` est un objet
// plat cle -> chaine (cles en notation pointee, ex. "nav.overview").

export type Lang = "en" | "fr" | "pt";

export type Dict = Record<string, string>;
