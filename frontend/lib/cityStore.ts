// Store ville (zustand) : slug de la ville active + pays actif du parcours
// d'entrée, propagés à toute l'app. Le slug alimente les appels API (query
// `city` sur les GET, champ `city` sur les POST) ; le pays pilote l'écran de
// choix de ville. Gaia par défaut.
//
// Persistance : la ville en localStorage (`barzel_city`), le pays en
// sessionStorage (`barzel_country`, transitoire au parcours), tous deux validés
// contre le registre (valeur inconnue → repli). Séquence sans flash NI
// divergence SSR : le premier rendu client reste le défaut (identique au HTML
// serveur), les effets de fetch de useGaia sont gardés par `ready`, et CityKey
// hydrate ville + pays en layout effect (avant tout paint et tout fetch) puis
// lève `ready`. Le reset d'état par CityKey (remontage par slug) est inchangé.
//
// Play-once de la révélation (lot 3) : session-scoped, hors état réactif
// (sessionStorage `barzel_revealed`, un slug par ligne) : `markRevealed` /
// `hasRevealed` sont impératifs, appelés au montage/démontage de la révélation.

import { create } from "zustand";
import { CITIES, DEFAULT_CITY, isCountryCode, countryOf, type CountryCode } from "./cities";

const CITY_KEY = "barzel_city";
const COUNTRY_KEY = "barzel_country";
const REVEALED_KEY = "barzel_revealed";

interface CityState {
  slug: string;
  /** pays actif du parcours d'entrée ; null tant qu'aucun choix n'a été fait */
  country: CountryCode | null;
  /** vrai une fois ville + pays persistés appliqués : les fetchs attendent ce feu vert */
  ready: boolean;
  setSlug: (slug: string) => void;
  setCountry: (code: CountryCode) => void;
  hydrate: () => void;
}

export const useCityStore = create<CityState>((set, get) => ({
  slug: DEFAULT_CITY.slug,
  country: null,
  ready: false,
  setSlug: (slug) => {
    try {
      window.localStorage.setItem(CITY_KEY, slug);
    } catch {
      /* stockage indisponible : le choix vaut pour la session */
    }
    set({ slug, country: countryOf(slug) });
  },
  setCountry: (code) => {
    try {
      window.sessionStorage.setItem(COUNTRY_KEY, code);
    } catch {
      /* stockage indisponible */
    }
    set({ country: code });
  },
  hydrate: () => {
    if (get().ready || typeof window === "undefined") return;
    let slug = get().slug;
    try {
      const stored = window.localStorage.getItem(CITY_KEY);
      if (stored && CITIES.some((c) => c.slug === stored)) slug = stored;
    } catch {
      /* stockage indisponible */
    }
    // Pays : préférence au choix de session, sinon dérivé de la ville persistée.
    let country: CountryCode = countryOf(slug);
    try {
      const storedCountry = window.sessionStorage.getItem(COUNTRY_KEY);
      if (isCountryCode(storedCountry)) country = storedCountry;
    } catch {
      /* stockage indisponible */
    }
    set({ slug, country, ready: true });
  },
}));

/** Slug courant hors React (client API, bridges). */
export const currentCitySlug = () => useCityStore.getState().slug;

// --- Play-once de la révélation (session) --------------------------------
// Hors état réactif : lu/écrit à la demande, ne déclenche aucun re-render.

function readRevealed(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(REVEALED_KEY);
    return new Set(raw ? raw.split(",").filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

/** La révélation de cette ville a-t-elle déjà joué dans la session ? */
export function hasRevealed(slug: string): boolean {
  if (typeof window === "undefined") return false;
  return readRevealed().has(slug);
}

/** Marque la révélation de cette ville comme jouée pour la session. */
export function markRevealed(slug: string): void {
  if (typeof window === "undefined") return;
  const seen = readRevealed();
  if (seen.has(slug)) return;
  seen.add(slug);
  try {
    window.sessionStorage.setItem(REVEALED_KEY, Array.from(seen).join(","));
  } catch {
    /* stockage indisponible */
  }
}
