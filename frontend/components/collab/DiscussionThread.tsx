"use client";

// Fil de discussion de l'accueil. Depuis le lot C2 il est INTERACTIF : ancre
// (maille / actif / verdict / général), titre de décision, messages (seedés +
// créés en session), un point de non-lu optionnel près du titre, et un champ de
// réponse en bas. Les messages créés en session portent l'horodatage « à
// l'instant » ; leur auteur est le compte courant au moment de l'envoi.

import type { Thread } from "@/lib/collab/types";
import { accountOf } from "@/lib/collab/types";
import { anchorText, resolveText } from "@/lib/collab/i18nText";
import { useT, useLang } from "@/lib/i18n/useT";
import { Avatar } from "./Avatar";
import { AnchorChip } from "./AnchorChip";
import { NotifDot } from "./NotifDot";
import { ReplyComposer } from "./ReplyComposer";

export function DiscussionThread({
  thread,
  unread = 0,
  highlight = false,
}: {
  thread: Thread;
  unread?: number;
  highlight?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  return (
    <article
      id={`thread-${thread.id}`}
      className={`flex scroll-mt-24 flex-col rounded-2xl border bg-white p-5 shadow-card transition-shadow ${
        highlight ? "border-gold/70 ring-2 ring-gold/50" : "border-navy/10"
      }`}
    >
      {/* Chip d'objet cliquable (lot C3) : ramène à l'objet dans le dashboard. */}
      <AnchorChip anchor={thread.anchor} citySlug={thread.citySlug} />
      <div className="flex items-start gap-2">
        {/* Titre : clé cs.* pour un fil seedé, saisie verbatim pour un fil de session.
            Un fil ouvert par SIGNALEMENT n'en porte pas : son titre est son objet, rendu
            depuis l'ancre, donc dans la langue du lecteur (lot QA-1d). */}
        <h3 className="min-w-0 flex-1 font-display text-[17px] leading-snug text-navy">
          {thread.title ? resolveText(t, thread.title) : anchorText(t, lang, thread.anchor)}
        </h3>
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
                  <span className="text-label text-muted">{t(author.roleLabel)}</span>
                  <span className="text-label text-muted">· {resolveText(t, m.time, m.timeParams)}</span>
                </div>
                <p className="mt-0.5 text-body text-ink-soft">{resolveText(t, m.text)}</p>
              </div>
            </div>
          );
        })}
      </div>

      <ReplyComposer threadId={thread.id} />
    </article>
  );
}
