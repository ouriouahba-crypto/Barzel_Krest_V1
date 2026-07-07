"use client";

// Choix de la ville (étape 2 du parcours). Filtré par le pays choisi à l'étape
// précédente (store) ; en repli (accès direct sans pays choisi), toutes les
// villes sont proposées, groupées par pays. Data-driven depuis le registre.
//
// La sélection pose la ville dans le store (persistée) puis mène au dashboard.
// La révélation ville (lot 3) s'intercalera ici sans changer cette logique.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { EntryShell } from "@/components/entry/EntryShell";
import { COUNTRIES, citiesForCountry, type CityDef } from "@/lib/cities";
import { useCityStore } from "@/lib/cityStore";

// Route d'arrivée dans le dashboard après le choix de ville.
const DASHBOARD_HOME = "/vue-ensemble";

function CityCard({ city, onPick }: { city: CityDef; onPick: (c: CityDef) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(city)}
      className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-2xl border border-cream/12 bg-navy-700 text-left transition-colors hover:border-gold/50"
    >
      {/* Photo de la ville en fond ; à défaut, le navy tient lieu de repli propre. */}
      <div
        aria-hidden
        className="absolute inset-0 scale-100 bg-cover bg-center transition-transform duration-500 ease-soft group-hover:scale-[1.04]"
        style={{ backgroundImage: `url(/cities/${city.slug}.webp)` }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(10,22,40,0.15) 0%, rgba(10,22,40,0.55) 55%, rgba(10,22,40,0.92) 100%)" }}
      />
      <div className="relative z-10 p-5">
        <h2 className="font-display text-[22px] leading-tight text-cream transition-colors group-hover:text-gold-300">
          {city.label}
        </h2>
        <span className="mt-2 inline-flex items-center gap-2 text-btn font-semibold uppercase tracking-[0.14em] text-gold/85 transition-colors group-hover:text-gold-300">
          Ouvrir
          <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
        </span>
      </div>
    </button>
  );
}

export default function VillesPage() {
  const router = useRouter();
  const country = useCityStore((s) => s.country);
  const setSlug = useCityStore((s) => s.setSlug);

  const pick = (city: CityDef) => {
    setSlug(city.slug);
    router.push(DASHBOARD_HOME);
  };

  // Pays choisi : sa liste seule ; sinon repli sur tous les pays.
  const sections = country
    ? [COUNTRIES.find((c) => c.code === country)!].filter(Boolean)
    : COUNTRIES;
  const singleCountry = !!country && sections.length === 1;

  return (
    <EntryShell
      step={
        <Link href="/pays" className="transition-colors hover:text-gold-300">
          ‹ Pays
        </Link>
      }
    >
      <div className="fade-up w-full max-w-5xl">
        <div className="text-center">
          <p className="text-label uppercase tracking-[0.32em] text-gold/80">Étape 2 sur 2</p>
          <h1 className="mt-4 font-display text-[clamp(30px,5vw,48px)] font-medium leading-tight text-cream">
            {singleCountry ? `Choisissez une ville · ${sections[0].label}` : "Choisissez une ville"}
          </h1>
        </div>

        <div className="mt-12 space-y-10">
          {sections.map((section) => (
            <section key={section.code}>
              {!singleCountry && (
                <h3 className="mb-4 text-label uppercase tracking-[0.22em] text-cream/55">{section.label}</h3>
              )}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {citiesForCountry(section.code).map((city) => (
                  <CityCard key={city.slug} city={city} onPick={pick} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </EntryShell>
  );
}
