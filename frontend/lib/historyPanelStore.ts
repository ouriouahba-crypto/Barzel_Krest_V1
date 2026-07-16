// Store panneau d'historique (zustand) : ouvert/ferme du panneau des conversations,
// persiste en localStorage (`barzel_history_panel` = "open"/"closed"). Defaut ouvert.
// Meme modele SSR-safe que sidebarStore : defaut au niveau module, hydrate() applique
// le persiste au montage, setOpen() ecrit a chaque changement.

import { create } from "zustand";

const KEY = "barzel_history_panel";

interface HistoryPanelState {
  open: boolean;
  toggle: () => void;
  setOpen: (v: boolean) => void;
  hydrate: () => void;
}

export const useHistoryPanelStore = create<HistoryPanelState>((set, get) => ({
  open: true,
  toggle: () => get().setOpen(!get().open),
  setOpen: (v) => {
    try {
      window.localStorage.setItem(KEY, v ? "open" : "closed");
    } catch {
      /* stockage indisponible : le choix vaut pour la session */
    }
    set({ open: v });
  },
  hydrate: () => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(KEY);
      if (stored === "open" || stored === "closed") set({ open: stored === "open" });
    } catch {
      /* stockage indisponible */
    }
  },
}));
