"use client";

// Compositeur du fil d'info (lot C4), RÉSERVÉ AU MANAGER (compte B). Replié par
// défaut (un bouton sobre). Déplié : titre, résumé, source, catégorie, et un
// impact/ancrage OPTIONNEL à une maille de la ville (navigable). L'envoi ajoute
// l'item en tête du fil (daté « à l'instant », attribué au compte courant) et une
// entrée au fil d'activité de la ville. L'analyste (A) ne voit jamais ce
// compositeur : la lecture seule est montrée par l'absence, pas par un message.

import { useMemo, useState } from "react";
import { useCollabStore } from "@/lib/collab/store";
import { feedAnchorTargets } from "@/lib/collab/seed";
import { FEED_CATEGORIES, accountOf, type Anchor, type FeedCategory } from "@/lib/collab/types";
import { Avatar } from "./Avatar";

const INPUT =
  "mt-1.5 w-full rounded-xl border border-navy/15 bg-cream/40 px-3 py-2 text-body text-ink placeholder:text-muted focus:border-gold/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gold/25";
const LABEL = "block text-label font-semibold uppercase tracking-[0.14em] text-ink-soft";

export function FeedComposer({ citySlug }: { citySlug: string }) {
  const role = useCollabStore((s) => s.role);
  const postFeedItem = useCollabStore((s) => s.postFeedItem);
  const current = accountOf(role);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [source, setSource] = useState("");
  const [category, setCategory] = useState<FeedCategory>("offre");
  const [anchorIdx, setAnchorIdx] = useState(-1); // -1 = aucun impact

  const targets = useMemo<Anchor[]>(() => feedAnchorTargets(citySlug), [citySlug]);
  const canSend = title.trim().length > 0 && summary.trim().length > 0 && source.trim().length > 0;

  const reset = () => {
    setTitle("");
    setSummary("");
    setSource("");
    setCategory("offre");
    setAnchorIdx(-1);
    setOpen(false);
  };

  const submit = () => {
    if (!canSend) return;
    const target = anchorIdx >= 0 ? targets[anchorIdx] : null;
    const impact = target
      ? { zone: target.label, zoneId: target.zoneId, route: target.route }
      : undefined;
    postFeedItem({ citySlug, source, title, summary, category, impact, authorId: role });
    reset();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-2xl border border-dashed border-gold/40 bg-gold/[0.05] px-4 py-3 text-left transition-colors hover:border-gold/70 hover:bg-gold/[0.09]"
      >
        <span
          aria-hidden
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-body font-semibold text-gold"
        >
          +
        </span>
        <span className="min-w-0">
          <span className="block text-btn font-semibold text-navy">Publier une info</span>
          <span className="block text-caption text-ink-soft">Partager un signal de marché avec l'équipe</span>
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-gold/40 bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2.5">
        <Avatar id={role} size="md" />
        <span className="text-btn font-semibold text-ink">Nouvelle info</span>
        <span className="text-label text-muted">en tant que {current.name}</span>
      </div>

      <label className={LABEL} htmlFor="fc-title">
        Titre
      </label>
      <input
        id="fc-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ex. Nouveau plan d'aménagement voté sur l'arc est"
        className={INPUT}
      />

      <label className={`${LABEL} mt-3`} htmlFor="fc-sum">
        Résumé
      </label>
      <textarea
        id="fc-sum"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={2}
        placeholder="Une à deux phrases sur le signal et ce qu'il implique..."
        className={`${INPUT} resize-none`}
      />

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL} htmlFor="fc-src">
            Source
          </label>
          <input
            id="fc-src"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Ex. Idealista News"
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="fc-cat">
            Catégorie
          </label>
          <select
            id="fc-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value as FeedCategory)}
            className={INPUT}
          >
            {FEED_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {targets.length > 0 && (
        <>
          <label className={`${LABEL} mt-3`} htmlFor="fc-anchor">
            Impact (optionnel)
          </label>
          <select
            id="fc-anchor"
            value={anchorIdx}
            onChange={(e) => setAnchorIdx(Number(e.target.value))}
            className={INPUT}
          >
            <option value={-1}>Aucun</option>
            {targets.map((a, i) => (
              <option key={a.label} value={i}>
                {a.label}
              </option>
            ))}
          </select>
        </>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-full px-4 py-1.5 text-btn font-medium text-ink-soft transition-colors hover:text-navy"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="inline-flex items-center gap-2 rounded-full bg-navy px-5 py-1.5 text-btn font-semibold text-cream transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Publier
          <span aria-hidden className="text-gold">
            →
          </span>
        </button>
      </div>
    </div>
  );
}
