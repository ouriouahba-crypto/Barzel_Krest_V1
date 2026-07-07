"use client";

// Fil de discussion de l'accueil (lot C1), en LECTURE SEULE : ancre (maille /
// actif / verdict), titre de décision, messages seedés de A et B. Aucun champ de
// saisie, aucune réponse, aucune pastille : l'interactivité arrive aux lots C2+.

import type { AnchorKind, Thread } from "@/lib/collab/types";
import { accountOf } from "@/lib/collab/types";
import { Avatar } from "./Avatar";

const ANCHOR: Record<AnchorKind, { glyph: string; label: string }> = {
  zone: { glyph: "▣", label: "Maille" },
  asset: { glyph: "◈", label: "Actif" },
  verdict: { glyph: "◆", label: "Verdict" },
};

export function DiscussionThread({ thread }: { thread: Thread }) {
  const a = ANCHOR[thread.anchor.kind];
  return (
    <article className="rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
      <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-gold/20 bg-gold/[0.08] px-2.5 py-1 text-label font-medium text-gold-700">
        <span aria-hidden>{a.glyph}</span>
        <span className="uppercase tracking-[0.12em]">{a.label}</span>
        <span className="text-gold-700/70">·</span>
        <span className="normal-case tracking-normal">{thread.anchor.label}</span>
      </div>
      <h3 className="font-display text-[17px] leading-snug text-navy">{thread.title}</h3>

      <div className="mt-4 flex flex-col gap-4">
        {thread.messages.map((m) => {
          const author = accountOf(m.authorId);
          return (
            <div key={m.id} className="flex gap-3">
              <Avatar id={m.authorId} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-btn font-semibold text-ink">{author.name}</span>
                  <span className="text-label text-muted">{author.roleLabel}</span>
                  <span className="text-label text-muted">· {m.time}</span>
                </div>
                <p className="mt-0.5 text-body text-ink-soft">{m.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
