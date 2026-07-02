"use client";

import { ASSET_CLASSES, MODES, MODE_LABEL, Mode } from "@/lib/scoring";
import { MultiSelect, Segmented } from "./ui";

export function Header({
  marketLine,
  freguesias,
  selected,
  onSelected,
  mode,
  onMode,
  assetClass,
  onClass,
}: {
  marketLine: string;
  freguesias: { id: string; label: string }[];
  selected: string[];
  onSelected: (ids: string[]) => void;
  mode: Mode;
  onMode: (m: Mode) => void;
  assetClass: string;
  onClass: (c: string) => void;
}) {
  return (
    <header className="relative z-[1000] border-b border-navy/10 bg-cream/80 px-6 py-4 backdrop-blur">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="inline-block h-6 w-1.5 rounded-full bg-gold" />
            <h1 className="font-display text-[26px] leading-none text-navy">Vila Nova de Gaia</h1>
          </div>
          <p className="mt-1.5 max-w-2xl pl-[18px] text-[13px] text-muted">{marketLine}</p>
        </div>
        <div className="w-72">
          <MultiSelect options={freguesias} selected={selected} onChange={onSelected} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 pl-[18px]">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">Mode</span>
          <Segmented
            size="lg"
            options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
            value={mode}
            onChange={onMode}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">Classe</span>
          <Segmented options={ASSET_CLASSES} value={assetClass} onChange={onClass} />
        </div>
      </div>
    </header>
  );
}
