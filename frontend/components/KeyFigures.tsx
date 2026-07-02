"use client";

export interface Figure {
  label: string;
  value: string;
  sub?: string;
}

export function KeyFigures({ figures }: { figures: Figure[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {figures.map((f) => (
        <div
          key={f.label}
          className="relative overflow-hidden rounded-2xl border border-navy/10 bg-white px-4 py-3.5 shadow-card"
        >
          <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-gold/40 via-gold to-gold/40" />
          <div className="text-[11px] font-medium uppercase tracking-widest text-muted">{f.label}</div>
          <div className="mt-1 font-display text-[26px] leading-none text-navy">{f.value}</div>
          {f.sub && <div className="mt-1 text-[11px] text-muted">{f.sub}</div>}
        </div>
      ))}
    </div>
  );
}
