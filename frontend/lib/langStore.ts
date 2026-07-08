// Store langue (zustand) : langue active de l'UI, persistee en localStorage
// (`barzel_lang`, valeurs "en"/"fr"/"pt" uniquement). Defaut EN.
//
// Meme modele SSR-safe que sidebarStore/cityStore : aucun acces localStorage au
// niveau module, defaut = valeur SSR (identique au premier rendu client, zero
// divergence d'hydratation), hydrate() applique le persiste en useLayoutEffect
// (via HtmlLang) avant paint. setLang() ecrit la persistance a chaque changement.

import { create } from "zustand";
import { DEFAULT_LANG } from "./i18n";
import type { Lang } from "./i18n/types";

const LANG_KEY = "barzel_lang";

function isLang(v: string | null): v is Lang {
  return v === "en" || v === "fr" || v === "pt";
}

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
  hydrate: () => void;
}

export const useLangStore = create<LangState>((set) => ({
  lang: DEFAULT_LANG,
  setLang: (l) => {
    try {
      window.localStorage.setItem(LANG_KEY, l);
    } catch {
      /* stockage indisponible : le choix vaut pour la session */
    }
    set({ lang: l });
  },
  hydrate: () => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(LANG_KEY);
      if (isLang(stored)) set({ lang: stored });
    } catch {
      /* stockage indisponible */
    }
  },
}));
