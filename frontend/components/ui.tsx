"use client";

import { useEffect, useRef, useState } from "react";
import { Mode, scoreColor, verdictLabel, verdictTone } from "@/lib/scoring";

export function VerdictBadge({ mode, verdict }: { mode: Mode; verdict: string }) {
  const tone = verdictTone(mode, verdict);
  const cls = {
    good: "bg-[#284E3A] text-[#CDE7D6] border-[#3C6E51]",
    mid: "bg-[#4A3E1E] text-[#EDD9A8] border-[#6E5A2C]",
    low: "bg-[#4A2626] text-[#E7C4C4] border-[#6E3C3C]",
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-label font-medium tracking-wide ${cls}`}>
      {verdictLabel(verdict)}
    </span>
  );
}

export function ScoreDial({ score, size = 64, light = false }: { score: number; size?: number; light?: boolean }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = scoreColor(score);
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={light ? "rgba(10,22,40,0.10)" : "rgba(255,255,255,0.12)"} strokeWidth={5} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 0.5s cubic-bezier(0.22,1,0.36,1), stroke 0.4s" }}
      />
      <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" className={`${light ? "fill-navy" : "fill-cream"} font-display`} fontSize={size * 0.3}>
        {Math.round(score)}
      </text>
    </svg>
  );
}

export function PillarBar({
  label,
  native,
  subscore,
  dark = false,
}: {
  label: string;
  native: string;
  subscore: number | null;
  dark?: boolean;
}) {
  const s = subscore ?? 0;
  // La valeur native est du contenu : cream ≥ 0.85 sur fond sombre, ink.soft sur clair.
  const textMuted = dark ? "text-cream/85" : "text-ink-soft";
  const textMain = dark ? "text-cream" : "text-ink";
  const track = dark ? "bg-white/10" : "bg-navy/10";
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className={`text-body font-medium capitalize leading-snug ${textMain}`}>{label.replace(/_/g, " ")}</span>
        <span className={`text-td ${textMuted}`}>{native}</span>
      </div>
      <div className={`mt-1 h-1.5 w-full overflow-hidden rounded-full ${track}`}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(3, s)}%`,
            background: scoreColor(subscore),
            transition: "width 0.5s cubic-bezier(0.22,1,0.36,1), background 0.4s",
          }}
        />
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "md" | "lg";
}) {
  const pad = size === "lg" ? "px-4 py-2.5 text-sm" : "px-3 py-1.5 text-btn";
  return (
    <div className="inline-flex rounded-xl bg-navy/5 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`${pad} rounded-lg font-medium transition-all duration-300 ease-soft ${
              active ? "bg-navy text-cream shadow-sm" : "text-ink/70 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Toutes les freguesias",
}: {
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  const filtered = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  const summary = selected.length === 0 ? placeholder : `${selected.length} sélectionnée${selected.length > 1 ? "s" : ""}`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-navy/10 bg-white px-3.5 py-2.5 text-btn text-ink shadow-sm hover:border-gold/60"
      >
        <span className="flex items-center gap-2 text-muted">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-gold">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className={selected.length ? "text-ink font-medium" : ""}>{summary}</span>
        </span>
        <span className="text-muted">▾</span>
      </button>
      {open && (
        <div className="absolute z-[1200] mt-2 w-72 rounded-xl border border-navy/10 bg-white p-2 shadow-card">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une freguesia…"
            className="mb-2 w-full rounded-lg border border-navy/10 bg-cream/40 px-3 py-2 text-btn outline-none focus:border-gold"
          />
          <div className="max-h-64 overflow-auto pr-1">
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="mb-1 w-full rounded-md px-2 py-1 text-left text-label text-gold-700 hover:bg-cream">
                Effacer la sélection
              </button>
            )}
            {filtered.map((o) => {
              const on = selected.includes(o.id);
              return (
                <button
                  key={o.id}
                  onClick={() => toggle(o.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-btn hover:bg-cream"
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded border ${
                      on ? "border-gold bg-gold text-navy" : "border-navy/25"
                    }`}
                  >
                    {on && <span className="text-label leading-none">✓</span>}
                  </span>
                  <span className={on ? "font-medium text-ink" : "text-ink/80"}>{o.label}</span>
                </button>
              );
            })}
            {filtered.length === 0 && <div className="px-2 py-3 text-center text-label text-muted">Aucun résultat</div>}
          </div>
        </div>
      )}
    </div>
  );
}
