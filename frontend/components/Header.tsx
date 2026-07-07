"use client";

import { ASSET_CLASSES, MODES, MODE_LABEL, Mode } from "@/lib/scoring";
import { MultiSelect, Segmented } from "./ui";
import { useEffect } from "react";
import { EntryBreadcrumb } from "./EntryBreadcrumb";
import { KineticTitle } from "./motion/KineticTitle";
import { cityBySlug } from "@/lib/cities";
import { useCityStore } from "@/lib/cityStore";

export function Header({
  marketLine,
  freguesias,
  selected,
  onSelected,
  mode,
  onMode,
  assetClass,
  onClass,
  hideMode = false,
  hideSearch = false,
  hideClass = false,
}: {
  marketLine: string;
  freguesias: { id: string; label: string }[];
  selected: string[];
  onSelected: (ids: string[]) => void;
  mode: Mode;
  onMode: (m: Mode) => void;
  assetClass: string;
  onClass: (c: string) => void;
  hideMode?: boolean;
  hideSearch?: boolean;
  hideClass?: boolean;
}) {
  const city = cityBySlug(useCityStore((s) => s.slug));
  useEffect(() => {
    document.title = `Barzel Analytics · ${city.label}`;
  }, [city.label]);
  return (
    <header className="relative z-[1000] border-b border-navy/10 bg-cream/80 px-6 py-4 backdrop-blur">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 pl-[18px]">
            <EntryBreadcrumb />
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-block h-6 w-1.5 rounded-full bg-gold" />
            <h1 className="font-display text-[28px] leading-none text-navy">
              <KineticTitle text={city.label} />
            </h1>
          </div>
          <p className="mt-1.5 max-w-2xl pl-[18px] text-body text-ink-soft">{marketLine}</p>
        </div>
        {!hideSearch && (
          <div className="w-72">
            <MultiSelect
              options={freguesias}
              selected={selected}
              onChange={onSelected}
              placeholder={`Toutes les ${city.zoneNounPlural}`}
              searchPlaceholder={`Rechercher une ${city.zoneNoun}…`}
            />
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 pl-[18px]">
        {/* La ville se choisit désormais via le parcours d'entrée (fil d'Ariane
            ci-dessus) : plus de sélecteur de ville dans le dashboard. */}
        {!hideMode && (
          <div className="flex items-center gap-3">
            <span className="text-label font-semibold uppercase tracking-widest text-muted">Mode</span>
            <Segmented
              size="lg"
              options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
              value={mode}
              onChange={onMode}
            />
          </div>
        )}
        {!hideClass && (
          <div className="flex items-center gap-3">
            <span className="text-label font-semibold uppercase tracking-widest text-muted">Classe</span>
            <Segmented options={ASSET_CLASSES} value={assetClass} onChange={onClass} />
          </div>
        )}
      </div>
    </header>
  );
}
