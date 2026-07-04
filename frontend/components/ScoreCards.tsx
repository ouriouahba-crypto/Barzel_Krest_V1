"use client";

import { ModeScore } from "@/lib/api";
import { MODES, MODE_LABEL, Mode } from "@/lib/scoring";
import { ScoreDial, VerdictBadge } from "./ui";

export function ScoreCards({
  scores,
  activeMode,
  onMode,
  zoneName,
  classLabel,
}: {
  scores: Partial<Record<Mode, ModeScore>>;
  activeMode: Mode;
  onMode: (m: Mode) => void;
  zoneName: string;
  classLabel?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="font-display text-[15px] text-navy">Scores par mode</h2>
        <span className="text-[12px] text-muted">· {zoneName}</span>
        {classLabel && (
          <span className="ml-auto rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[11px] font-medium text-gold-600">
            {classLabel}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {MODES.map((m) => {
          const s = scores[m];
          const active = m === activeMode;
          return (
            <button
              key={m}
              onClick={() => onMode(m)}
              className={`rounded-2xl border p-4 text-left transition-all duration-300 ease-soft ${
                active
                  ? "border-gold/70 bg-navy text-cream shadow-card ring-1 ring-gold/40"
                  : "border-navy/10 bg-navy/95 text-cream/90 hover:border-gold/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold uppercase tracking-widest text-gold/90">{MODE_LABEL[m]}</span>
                {active && <span className="h-1.5 w-1.5 rounded-full bg-gold" />}
              </div>
              <div className="mt-2 flex items-center gap-3">
                {s ? <ScoreDial score={s.total} size={58} /> : <div className="h-[58px] w-[58px] animate-pulse rounded-full bg-white/10" />}
                <div className="min-w-0">
                  {s ? (
                    <>
                      <VerdictBadge mode={m} verdict={s.verdict} />
                      <div className="mt-1.5 truncate text-[11px] text-cream/60">{s.native_indicator?.label}</div>
                    </>
                  ) : (
                    <div className="h-4 w-20 animate-pulse rounded bg-white/10" />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
