"use client";

// Remonte tout l'arbre de page quand la ville change : chaque useState
// (useGaia, conversations analyste, curseurs, tris de tableaux) repart à zéro,
// aucun état résiduel de la ville précédente.

import { useCityStore } from "@/lib/cityStore";

export function CityKey({ children }: { children: React.ReactNode }) {
  const slug = useCityStore((s) => s.slug);
  return (
    <div key={slug} className="contents">
      {children}
    </div>
  );
}
