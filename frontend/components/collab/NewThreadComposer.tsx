"use client";

// Compositeur de nouveau fil, en tête de la discussion (lot C2). Replié par
// défaut (un bouton sobre) ; déplié, il propose un titre de décision, un ancrage
// optionnel et simple (« Général ville » par défaut, ou un objet déjà présent
// dans le seed de la ville), et un premier message. L'envoi crée le fil au nom du
// compte courant et le place en tête. L'ancrage précis depuis un objet du
// dashboard viendra au C3.

import { useMemo, useState } from "react";
import { useCollabStore } from "@/lib/collab/store";
import { seedAnchors } from "@/lib/collab/seed";
import { accountOf, anchorKey, type Anchor } from "@/lib/collab/types";
import { anchorText } from "@/lib/collab/i18nText";
import { useT, useLang } from "@/lib/i18n/useT";
import { Avatar } from "./Avatar";

// Ancre par défaut : son libellé est une CLÉ (seule ancre traduisible ; les autres
// sont des noms propres). Elle n'entre pas dans l'appariement des signalements du
// dashboard, qui ne produit jamais d'ancre « general ».
const GENERAL: Anchor = { kind: "general", label: "col.anchor.general" };

export function NewThreadComposer({ citySlug }: { citySlug: string }) {
  const role = useCollabStore((s) => s.role);
  const addThread = useCollabStore((s) => s.addThread);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [anchorIdx, setAnchorIdx] = useState(0);
  const t = useT();
  const lang = useLang();
  const current = accountOf(role);

  // « Général ville » en tête, puis les objets d'ancrage du seed de la ville.
  const anchors = useMemo<Anchor[]>(() => [GENERAL, ...seedAnchors(citySlug)], [citySlug]);
  const canSend = title.trim().length > 0 && text.trim().length > 0;

  const reset = () => {
    setTitle("");
    setText("");
    setAnchorIdx(0);
    setOpen(false);
  };

  const submit = () => {
    if (!canSend) return;
    addThread({ citySlug, title, anchor: anchors[anchorIdx] ?? GENERAL, authorId: role, text });
    reset();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-2xl border border-dashed border-gold/40 bg-gold/[0.05] px-5 py-4 text-left transition-colors hover:border-gold/70 hover:bg-gold/[0.09]"
      >
        <span
          aria-hidden
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-body font-semibold text-gold"
        >
          +
        </span>
        <span className="min-w-0">
          <span className="block text-btn font-semibold text-navy">{t("col.newThread.cta")}</span>
          <span className="block text-caption text-ink-soft">{t("col.newThread.ctaHint")}</span>
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-gold/40 bg-white p-5 shadow-card">
      <div className="mb-3 flex items-center gap-2.5">
        <Avatar id={role} size="md" />
        <span className="text-btn font-semibold text-ink">{t("col.newThread.title")}</span>
        <span className="text-label text-muted">{t("col.composer.asName", { name: current.name })}</span>
      </div>

      <label className="block text-label font-semibold uppercase tracking-[0.14em] text-ink-soft" htmlFor="nt-title">
        {t("col.newThread.labelTitle")}
      </label>
      <input
        id="nt-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("col.newThread.placeholderTitle")}
        className="mt-1.5 w-full rounded-xl border border-navy/15 bg-cream/40 px-3.5 py-2.5 text-body text-ink placeholder:text-muted focus:border-gold/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gold/25"
      />

      <label className="mt-4 block text-label font-semibold uppercase tracking-[0.14em] text-ink-soft" htmlFor="nt-anchor">
        {t("col.newThread.labelAnchor")}
      </label>
      <select
        id="nt-anchor"
        value={anchorIdx}
        onChange={(e) => setAnchorIdx(Number(e.target.value))}
        className="mt-1.5 w-full rounded-xl border border-navy/15 bg-cream/40 px-3.5 py-2.5 text-body text-ink focus:border-gold/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gold/25"
      >
        {anchors.map((a, i) => (
          <option key={anchorKey(a)} value={i}>
            {anchorText(t, lang, a)}
          </option>
        ))}
      </select>

      <label className="mt-4 block text-label font-semibold uppercase tracking-[0.14em] text-ink-soft" htmlFor="nt-msg">
        {t("col.newThread.labelMsg")}
      </label>
      <textarea
        id="nt-msg"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={t("col.newThread.placeholderMsg")}
        className="mt-1.5 w-full resize-none rounded-xl border border-navy/15 bg-cream/40 px-3.5 py-2.5 text-body text-ink placeholder:text-muted focus:border-gold/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gold/25"
      />

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-full px-4 py-1.5 text-btn font-medium text-ink-soft transition-colors hover:text-navy"
        >
          {t("col.common.cancel")}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="inline-flex items-center gap-2 rounded-full bg-navy px-5 py-1.5 text-btn font-semibold text-cream transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("col.newThread.submit")}
          <span aria-hidden className="text-gold">
            →
          </span>
        </button>
      </div>
    </div>
  );
}
