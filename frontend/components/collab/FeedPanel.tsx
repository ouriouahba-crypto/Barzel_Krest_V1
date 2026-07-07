"use client";

// Fil d'info en panneau latéral droit (lot C1), en LECTURE SEULE. Reprend le
// pattern de slide-in du panneau de détail existant (DetailPanel) : translate-x
// + transition-transform, neutralisée sous prefers-reduced-motion par la règle
// globale (état final immédiat). Items seedés : source, date, titre, résumé, et
// un tag d'impact optionnel.

import type { FeedItem } from "@/lib/collab/types";

export function FeedPanel({ open, onClose, items }: { open: boolean; onClose: () => void; items: FeedItem[] }) {
  return (
    <>
      {/* scrim : ferme au clic hors panneau */}
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 z-[1000] bg-navy/30 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        aria-label="Fil d'info"
        className={`fixed right-0 top-0 z-[1100] flex h-full w-[420px] max-w-[92vw] flex-col border-l border-navy/10 bg-cream-200 shadow-panel transition-transform duration-500 ease-soft will-change-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-navy/10 px-5 py-4">
          <div>
            <div className="text-label font-semibold uppercase tracking-[0.16em] text-gold-700">Fil d'info</div>
            <div className="text-caption text-ink-soft">Signaux de marché suivis par l'équipe</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer le fil d'info"
            className="rounded-full border border-navy/10 bg-white px-2.5 py-1 text-navy/60 transition-colors hover:text-navy"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-3">
            {items.map((f) => (
              <article key={f.id} className="rounded-xl border border-navy/10 bg-white p-4 shadow-card">
                <div className="flex items-center gap-2 text-label uppercase tracking-[0.12em] text-muted">
                  <span className="font-semibold text-gold-700">{f.source}</span>
                  <span aria-hidden className="text-navy/20">·</span>
                  <span>{f.date}</span>
                </div>
                <h3 className="mt-1.5 font-display text-[16px] leading-snug text-navy">{f.title}</h3>
                <p className="mt-1 text-caption text-ink-soft">{f.summary}</p>
                {f.impact && (
                  <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-navy px-2.5 py-1 text-label text-cream">
                    <span aria-hidden className="text-gold">⚑</span>
                    <span className="font-medium">Impact · {f.impact.zone}</span>
                    <span className="text-cream/60">:</span>
                    <span className="text-cream/85">{f.impact.note}</span>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
