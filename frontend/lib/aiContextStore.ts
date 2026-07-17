// Store de contexte IA volatil (zustand, NON persiste) : classe d'actif
// actuellement affichee sur le dashboard, publiee par useGaia. Sert au chat
// lateral (AiChatDock, monte globalement) pour connaitre « ce que tu regardes »
// sans dependre de l'etat local de la page. Volatil par choix : le chat lateral
// n'a pas de memoire, la classe repart a « residential » au rechargement.

import { create } from "zustand";

interface AiContextState {
  cls: string;
  setCls: (c: string) => void;
}

export const useAiContextStore = create<AiContextState>((set) => ({
  cls: "residential",
  setCls: (c) => set({ cls: c }),
}));
