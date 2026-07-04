"use client";

// Sélecteur de ville : prévu pour le multi-villes, monté par le Header
// UNIQUEMENT quand plusieurs villes sont enregistrées (CITIES.length > 1).
// Avec Gaia seule, ce composant n'apparaît nulle part.

import { CITIES } from "@/lib/cities";
import { useCityStore } from "@/lib/cityStore";

export function CitySelector() {
  const slug = useCityStore((s) => s.slug);
  const setSlug = useCityStore((s) => s.setSlug);
  if (CITIES.length < 2) return null;
  return (
    <div className="flex items-center gap-3">
      <span className="text-label font-semibold uppercase tracking-widest text-muted">Ville</span>
      <select
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        className="cursor-pointer rounded-xl border border-navy/10 bg-white px-3 py-2 text-btn text-ink shadow-sm outline-none hover:border-gold/60"
      >
        {CITIES.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  );
}
