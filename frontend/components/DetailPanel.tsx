"use client";

import { ModeScore } from "@/lib/api";
import { MODE_LABEL, Mode } from "@/lib/scoring";
import { PillarBar, ScoreDial, VerdictBadge } from "./ui";
import { HayaSlider } from "./HayaSlider";

export interface KeyFigure {
  label: string;
  value: string;
}

export function DetailPanel({
  open,
  onClose,
  score,
  mode,
  keyFigures,
  haya,
}: {
  open: boolean;
  onClose: () => void;
  score: ModeScore | null;
  mode: Mode;
  keyFigures: KeyFigure[];
  haya: { baseTotal: number; margeWeight: number } | null;
}) {
  return (
    <>
      {/* scrim on small screens */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-[1000] bg-navy/30 transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {/* will-change promotes the panel to its own compositing layer: Safari can
          otherwise paint Leaflet's translate3d panes OVER a fixed element despite
          its higher z-index (panel slides in but stays invisible under the map). */}
      <aside
        className={`fixed right-0 top-0 z-[1100] h-full w-[400px] max-w-[92vw] overflow-y-auto border-l border-navy/10 bg-cream-200 shadow-panel transition-transform duration-500 ease-soft will-change-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {score && (
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-gold-600">
                  {MODE_LABEL[mode]}
                </div>
                <h2 className="font-display text-xl leading-tight text-navy">{score.zone_name}</h2>
              </div>
              <button
                onClick={onClose}
                className="rounded-full border border-navy/10 bg-white px-2.5 py-1 text-navy/60 hover:text-navy"
              >
                ✕
              </button>
            </div>

            {haya && <div className="mt-4"><HayaSlider {...haya} /></div>}

            <div className="mt-5 flex items-center gap-4 rounded-2xl border border-navy/10 bg-navy p-4">
              <ScoreDial score={score.total} size={68} />
              <div>
                <VerdictBadge mode={mode} verdict={score.verdict} />
                <div className="mt-1.5 text-[12px] text-cream/70">{score.native_indicator?.label}</div>
              </div>
            </div>

            {keyFigures.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {keyFigures.map((k) => (
                  <div key={k.label} className="rounded-xl border border-navy/10 bg-white p-3">
                    <div className="text-[10px] uppercase tracking-wide text-muted">{k.label}</div>
                    <div className="font-display text-lg text-navy">{k.value}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5">
              <h3 className="mb-1 font-display text-[15px] text-navy">Piliers</h3>
              <div className="rounded-2xl border border-navy/10 bg-white p-3">
                {score.pillars.map((p) =>
                  p.applicable ? (
                    <div key={p.pillar}>
                      <PillarBar label={p.pillar} native={p.native.label} subscore={p.subscore} />
                      <p className="mb-1 mt-0.5 text-[11px] leading-snug text-muted">{p.why}</p>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
