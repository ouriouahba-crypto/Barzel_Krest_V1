"use client";

// Choix du pays (étape 1 du parcours). Data-driven depuis le registre
// (COUNTRIES) : ajouter une ville dans un nouveau pays le fait apparaître ici
// sans modifier cette page.

import { useRouter } from "next/navigation";
import { EntryShell } from "@/components/entry/EntryShell";
import { COUNTRIES, type CountryCode } from "@/lib/cities";
import { useCityStore } from "@/lib/cityStore";

export default function PaysPage() {
  const router = useRouter();
  const setCountry = useCityStore((s) => s.setCountry);

  const choose = (code: CountryCode) => {
    setCountry(code);
    router.push("/villes");
  };

  return (
    <EntryShell step="Pays">
      <div className="fade-up w-full max-w-4xl">
        <div className="text-center">
          <p className="text-label uppercase tracking-[0.32em] text-gold/80">Étape 1 sur 2</p>
          <h1 className="mt-4 font-display text-[clamp(30px,5vw,48px)] font-medium leading-tight text-cream">
            Choisissez un pays
          </h1>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {COUNTRIES.map((country) => (
            <button
              key={country.code}
              type="button"
              onClick={() => choose(country.code)}
              className="group relative overflow-hidden rounded-2xl border border-cream/12 bg-navy-700/60 p-8 text-left transition-colors hover:border-gold/50 hover:bg-navy-600/60"
            >
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-[26px] text-cream transition-colors group-hover:text-gold-300">
                  {country.label}
                </h2>
                <span className="text-label uppercase tracking-[0.18em] text-cream/55">
                  {country.cities.length} {country.cities.length > 1 ? "villes" : "ville"}
                </span>
              </div>
              <p className="mt-4 text-caption text-cream/70">
                {country.cities.map((c) => c.label).join(" · ")}
              </p>
              <span
                aria-hidden
                className="mt-6 inline-flex items-center gap-2 text-btn font-semibold uppercase tracking-[0.14em] text-gold/80 transition-colors group-hover:text-gold-300"
              >
                Voir les villes
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </EntryShell>
  );
}
