"use client";

import { CityResponse } from "@/lib/api";
import { scoreColor } from "@/lib/scoring";
import { displayName } from "@/lib/useGaia";

export function MapLegendBar({ min, max }: { min: number; max: number }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-navy/10 bg-white px-4 py-2.5 shadow-card">
      <span className="text-label font-medium text-muted">Prudence</span>
      <div className="relative h-2.5 flex-1 rounded-full" style={{ background: "linear-gradient(90deg,#9E5B5B,#C9A86A,#2F6B3D)" }}>
        <span className="absolute -top-4 left-0 text-label font-semibold text-navy">{Math.round(min)}</span>
        <span className="absolute -top-4 right-0 text-label font-semibold text-navy">{Math.round(max)}</span>
      </div>
      <span className="text-label font-medium text-muted">Favorable</span>
    </div>
  );
}

function scoreBg(score: number) {
  const t = Math.max(0, Math.min(1, score / 100));
  return `rgba(201,168,106,${0.15 + t * 0.35})`;
}

export function RankingList({
  city,
  selected,
  focus,
  onSelect,
}: {
  city?: CityResponse;
  selected: string[];
  focus: string | null;
  onSelect: (id: string) => void;
}) {
  if (!city) return <div className="text-[13px] text-muted">Chargement…</div>;
  const rows = city.zones
    .filter((z) => z.level !== "municipio")
    .filter((z) => selected.length === 0 || selected.includes(z.zone))
    .sort((a, b) => b.total - a.total);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-display text-[15px] text-navy">Classement des freguesias</h3>
        <span className="text-[11px] text-muted">{rows.length} zones</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {rows.map((z, i) => (
          <button
            key={z.zone}
            onClick={() => onSelect(z.zone)}
            className={`mb-1 flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all duration-200 ${
              focus === z.zone ? "border-gold bg-white ring-1 ring-gold/40" : "border-transparent bg-white/60 hover:bg-white"
            }`}
          >
            <span className="w-4 shrink-0 text-center font-display text-[13px] text-muted">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">{displayName(z.zone_name)}</span>
              <span className="block text-[11px] text-muted">{z.verdict}</span>
            </span>
            <span className="flex h-8 w-9 shrink-0 items-center justify-center rounded-lg font-display text-[14px] font-medium text-navy" style={{ background: scoreBg(z.total) }}>
              {Math.round(z.total)}
            </span>
            <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: scoreColor(z.total) }} />
          </button>
        ))}
      </div>
    </div>
  );
}
