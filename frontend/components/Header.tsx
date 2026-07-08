"use client";

import { ASSET_CLASSES, MODES, MODE_LABEL, Mode } from "@/lib/scoring";
import { MultiSelect, Segmented } from "./ui";
import { useEffect } from "react";
import { EntryBreadcrumb } from "./EntryBreadcrumb";
import { KineticTitle } from "./motion/KineticTitle";
import { cityBySlug } from "@/lib/cities";
import { useCityStore } from "@/lib/cityStore";
import { useSidebarStore } from "@/lib/sidebarStore";
import { useLang, useT } from "@/lib/i18n/useT";
import { cityDisplay } from "@/lib/i18n/display";
import { LangSwitcher } from "./i18n/LangSwitcher";

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
  const slug = useCityStore((s) => s.slug);
  const city = cityBySlug(slug);
  const lang = useLang();
  const t = useT();
  const cityLabel = cityDisplay(slug, lang);
  const sidebarOpen = useSidebarStore((s) => s.open);
  useEffect(() => {
    document.title = `Barzel Analytics · ${cityLabel}`;
  }, [cityLabel]);
  return (
    <header className="relative z-[1000] border-b border-navy/10 bg-cream/80 px-6 py-4 backdrop-blur">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className={`mb-2 ${sidebarOpen ? "pl-[18px]" : "pl-14"}`}>
            <EntryBreadcrumb />
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-block h-6 w-1.5 rounded-full bg-gold" />
            <h1 className="font-display text-[28px] leading-none text-navy">
              <KineticTitle text={cityLabel} />
            </h1>
          </div>
          <p className="mt-1.5 max-w-2xl pl-[18px] text-body text-ink-soft">{marketLine}</p>
        </div>
        {/* Bloc droit : sélecteur de langue en haut, recherche multi-mailles en
            dessous (inchangée). `self-start` épingle le bloc en haut à droite
            pendant que le bloc titre reste aligné en bas de la rangée. */}
        <div className="flex flex-col items-end gap-3 self-start">
          <LangSwitcher tone="cream" />
          {!hideSearch && (
            <div className="w-72">
              <MultiSelect
                options={freguesias}
                selected={selected}
                onChange={onSelected}
                placeholder={t("header.allZones", { plural: city.zoneNounPlural })}
                searchPlaceholder={t("header.searchZone", { noun: city.zoneNoun })}
              />
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 pl-[18px]">
        {/* La ville se choisit désormais via le parcours d'entrée (fil d'Ariane
            ci-dessus) : plus de sélecteur de ville dans le dashboard. */}
        {!hideMode && (
          <div className="flex items-center gap-3">
            <span className="text-label font-semibold uppercase tracking-widest text-muted">{t("header.mode")}</span>
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
            <span className="text-label font-semibold uppercase tracking-widest text-muted">{t("header.class")}</span>
            <Segmented options={ASSET_CLASSES} value={assetClass} onChange={onClass} />
          </div>
        )}
      </div>
    </header>
  );
}
