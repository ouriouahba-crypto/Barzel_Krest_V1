"use client";

// Terme de maille de la ville active, pour les libellés de l'UI (en-têtes de
// tableaux, placeholders, titres de graphes, textes de section). « freguesia »
// pour le Portugal (Gaia/Lisbonne), « commune » pour la Belgique (Bruxelles).
// Piloté par le registre des villes (lib/cities.ts → zoneNoun / zoneNounPlural).

import { cityBySlug } from "./cities";
import { useCityStore } from "./cityStore";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function useZoneNoun() {
  const c = cityBySlug(useCityStore((s) => s.slug));
  const sg = c.zoneNoun;
  const pl = c.zoneNounPlural;
  return { sg, pl, Sg: cap(sg), Pl: cap(pl) };
}
