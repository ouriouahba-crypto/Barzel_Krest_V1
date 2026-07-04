// Store ville (zustand) : slug de la ville active, propagé à tous les appels
// API (query `city` sur les GET, champ `city` sur les POST). Gaia par défaut ;
// le sélecteur (components/CitySelector) ne se monte que si CITIES.length > 1.
//
// Persistance : localStorage `barzel_city`, validé contre le registre (slug
// inconnu → défaut). Séquence sans flash NI divergence SSR : le premier rendu
// client reste le défaut (identique au HTML serveur), les effets de fetch de
// useGaia sont gardés par `ready`, et CityKey hydrate le slug persisté en
// layout effect (avant tout paint et tout fetch) puis lève `ready`. Le reset
// d'état par CityKey (remontage par slug) est inchangé.

import { create } from "zustand";
import { CITIES, DEFAULT_CITY } from "./cities";

const STORAGE_KEY = "barzel_city";

interface CityState {
  slug: string;
  /** vrai une fois le slug persisté appliqué : les fetchs attendent ce feu vert */
  ready: boolean;
  setSlug: (slug: string) => void;
  hydrate: () => void;
}

export const useCityStore = create<CityState>((set, get) => ({
  slug: DEFAULT_CITY.slug,
  ready: false,
  setSlug: (slug) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, slug);
    } catch {
      /* stockage indisponible : le choix vaut pour la session */
    }
    set({ slug });
  },
  hydrate: () => {
    if (get().ready || typeof window === "undefined") return;
    let slug = get().slug;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && CITIES.some((c) => c.slug === stored)) slug = stored;
    } catch {
      /* stockage indisponible */
    }
    set({ slug, ready: true });
  },
}));

/** Slug courant hors React (client API, bridges). */
export const currentCitySlug = () => useCityStore.getState().slug;
