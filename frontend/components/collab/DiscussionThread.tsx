"use client";

// Fil de discussion de l'accueil. Depuis le lot C2 il est INTERACTIF : ancre
// (maille / actif / verdict / général), titre de décision, messages (seedés +
// créés en session), un point de non-lu optionnel près du titre, et un champ de
// réponse en bas. Les messages créés en session portent l'horodatage « à
// l'instant » ; leur auteur est le compte courant au moment de l'envoi.

import type { Thread } from "@/lib/collab/types";
import { accountOf } from "@/lib/collab/types";
import { Avatar } from "./Avatar";
import { AnchorChip } from "./AnchorChip";
import { NotifDot } from "./NotifDot";
import { ReplyComposer } from "./ReplyComposer";

export function DiscussionThread({ thread, unread = 0 }: { thread: Thread; unread?: number }) {
  return (
    <article className="flex flex-col rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
      {/* Chip d'objet cliquable (lot C3) : ramène à l'objet dans le dashboard. */}
      <AnchorChip anchor={thread.anchor} citySlug={thread.citySlug} />
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
