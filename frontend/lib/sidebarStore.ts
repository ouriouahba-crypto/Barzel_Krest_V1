// Store sidebar (zustand) : ouverte/fermée du menu latéral du dashboard,
// persisté en localStorage (`barzel_sidebar` = "open"/"closed"). Défaut ouvert.
//
// Séquence sans divergence d'hydratation (même modèle que cityStore/CityKey) :
// aucun accès localStorage au niveau module (SSR safe), le premier rendu client
// reste le défaut `open: true` (identique au HTML serveur), et hydrate() applique
// l'état persisté en useLayoutEffect (avant le premier paint). setOpen() écrit la
// persistance à chaque changement.

import { create } from "zustand";

const SIDEBAR_KEY = "barzel_sidebar";

interface SidebarState {
  open: boolean;
  toggle: () => void;
  setOpen: (v: boolean) => void;
  hydrate: () => void;
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  open: true,
  toggle: () => get().setOpen(!get().open),
  setOpen: (v) => {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, v ? "open" : "closed");
    } catch {
      /* stockage indisponible : le choix vaut pour la session */
    }
    set({ open: v });
  },
  hydrate: () => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(SIDEBAR_KEY);
      if (stored === "open" || stored === "closed") set({ open: stored === "open" });
    } catch {
      /* stockage indisponible */
    }
  },
}));
