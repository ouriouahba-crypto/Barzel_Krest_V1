// Store ville (zustand) : slug de la ville active, propagé à tous les appels
// API (query `city` sur les GET, champ `city` sur les POST). Gaia par défaut ;
// le sélecteur (components/CitySelector) ne se monte que si CITIES.length > 1.

import { create } from "zustand";
import { DEFAULT_CITY } from "./cities";

interface CityState {
  slug: string;
  setSlug: (slug: string) => void;
}

export const useCityStore = create<CityState>((set) => ({
  slug: DEFAULT_CITY.slug,
  setSlug: (slug) => set({ slug }),
}));

/** Slug courant hors React (client API, bridges). */
export const currentCitySlug = () => useCityStore.getState().slug;
