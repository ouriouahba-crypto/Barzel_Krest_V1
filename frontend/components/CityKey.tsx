"use client";

// Remonte tout l'arbre de page quand la ville change : chaque useState
// (useGaia, conversations analyste, curseurs, tris de tableaux) repart à zéro,
// aucun état résiduel de la ville précédente.
//
// Hydrate aussi le slug persisté (localStorage) en useLayoutEffect : le
// premier rendu client reste le défaut (identique au HTML serveur, zéro
// divergence d'hydratation) ; les fetchs de useGaia attendent `ready`, levé
// ici avant le premier paint : aucun fetch Gaia perdu, aucun flash.

import { useEffect, useLayoutEffect } from "react";
import { useCityStore } from "@/lib/cityStore";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function CityKey({ children }: { children: React.ReactNode }) {
  const slug = useCityStore((s) => s.slug);
  const hydrate = useCityStore((s) => s.hydrate);
  useIsoLayoutEffect(() => {
    hydrate();
  }, [hydrate]);
  return (
    <div key={slug} className="contents">
      {children}
    </div>
  );
}
