// État de transition d'entrée (lot 4) : un rideau navy plein cadre, monté au
// niveau layout (hors CityKey, donc résistant au remontage par changement de
// slug), couvre le passage carte -> dashboard. `cover` le lève, `uncover` le
// baisse. Store séparé du store ville : purement présentation.

import { create } from "zustand";

interface TransitionState {
  covering: boolean;
  cover: () => void;
  uncover: () => void;
}

export const useTransition = create<TransitionState>((set) => ({
  covering: false,
  cover: () => set({ covering: true }),
  uncover: () => set({ covering: false }),
}));
