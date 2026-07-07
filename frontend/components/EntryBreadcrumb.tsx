"use client";

// Fil d'Ariane du dashboard : « Pays › Ville », les deux segments cliquables
// (remonter au choix ville ou au choix pays). Remplace l'ancien sélecteur de
// ville : le dashboard lit la ville depuis l'état global, on ne la change plus
// qu'en repassant par le parcours d'entrée.

import Link from "next/link";
import { COUNTRY_LABEL, cityBySlug, countryOf } from "@/lib/cities";
import { useCityStore } from "@/lib/cityStore";

export function EntryBreadcrumb() {
  const slug = useCityStore((s) => s.slug);
  const city = cityBySlug(slug);
  const countryLabel = COUNTRY_LABEL[countryOf(slug)];
  return (
    <nav aria-label="Fil d'Ariane" className="flex items-center gap-2 text-label uppercase tracking-[0.18em]">
      <Link href="/pays" className="text-muted transition-colors hover:text-gold-700">
        {countryLabel}
      </Link>
      <span aria-hidden className="text-muted/60">
        ›
      </span>
      <Link href="/villes" className="font-semibold text-ink-soft transition-colors hover:text-gold-700">
        {city.label}
      </Link>
    </nav>
  );
}
