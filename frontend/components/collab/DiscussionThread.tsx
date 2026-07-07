"use client";

// Fil de discussion de l'accueil. Depuis le lot C2 il est INTERACTIF : ancre
// (maille / actif / verdict / général), titre de décision, messages (seedés +
// créés en session), un point de non-lu optionnel près du titre, et un champ de
// réponse en bas. Les messages créés en session portent l'horodatage « à
// l'instant » ; leur auteur est le compte courant au moment de l'envoi.

import type { AnchorKind, Thread } from "@/lib/collab/types";
import { accountOf } from "@/lib/collab/types";
import { Avatar } from "./Avatar";
import { NotifDot } from "./NotifDot";
import { ReplyComposer } from "./ReplyComposer";

const ANCHOR: Record<AnchorKind, { glyph: string; label: string }> = {
  zone: { glyph: "▣", label: "Maille" },
  asset: { glyph: "◈", label: "Actif" },
  verdict: { glyph: "◆", label: "Verdict" },
  general: { glyph: "◇", label: "Général" },
};

export function DiscussionThread({ thread, unread = 0 }: { thread: Thread; unread?: number }) {
  const a = ANCHOR[thread.anchor.kind] ?? ANCHOR.general;
  return (
    <article className="flex flex-col rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
      <div className="mb-1.5 inline-flex items-center gap-1.5 self-start rounded-full border border-gold/20 bg-gold/[0.08] px-2.5 py-1 text-label font-medium text-gold-700">
        <span aria-hidden>{a.glyph}</span>
        <span className="uppercase tracking-[0.12em]">{a.label}</span>
        <span className="text-gold-700/70">·</span>
        <span className="normal-case tracking-normal">{thread.anchor.label}</span>
      </div>
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 font-display text-[17px] leading-snug text-navy">{thread.title}</h3>
        {unread > 0 && <span className="mt-1.5 shrink-0"><NotifDot count={unread} /></span>}
      </div>

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

      <ReplyComposer threadId={thread.id} />
    </article>
  );
}
