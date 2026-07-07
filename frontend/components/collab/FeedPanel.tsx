"use client";

// Fil d'info en panneau latéral droit. Depuis le lot C4 il est ACTIF :
//  - le MANAGER (compte B) peut publier une info (compositeur en tête) ; l'analyste
//    (A) reste en lecture (pas de compositeur, sobrement absent) ;
//  - filtres par catégorie (puces) limités aux catégories présentes dans la ville ;
//  - chaque item porte un tag d'impact CLIQUABLE quand il est ancré à une maille
//    (retour à l'objet dans le dashboard via AnchorChip / focusBridge du C3) ;
//  - chaque item porte « Ouvrir une discussion » : PONT vers la discussion (crée un
//    fil ancré à l'impact, sinon général titré depuis l'info, avec un premier message
//    référençant l'info), déclenche la pastille de l'autre compte (mécanique C2) et
//    demande à l'accueil d'afficher le fil créé.
// Le slide-in reprend le pattern du panneau de détail (translate-x + transition),
// neutralisé sous prefers-reduced-motion par la règle globale (état final immédiat).

import { useMemo, useState } from "react";
import { useCollabStore, feedForCity } from "@/lib/collab/store";
import {
  FEED_CATEGORIES,
  feedCategoryLabel,
  accountOf,
  type Anchor,
  type FeedCategory,
  type FeedItem,
} from "@/lib/collab/types";
import { Avatar } from "./Avatar";
import { AnchorChip } from "./AnchorChip";
import { FeedComposer } from "./FeedComposer";

const GENERAL: Anchor = { kind: "general", label: "Général ville" };

export function FeedPanel({
  open,
  onClose,
  citySlug,
  onOpenDiscussion,
}: {
  open: boolean;
  onClose: () => void;
  citySlug: string;
  onOpenDiscussion: (threadId: string) => void;
}) {
  const role = useCollabStore((s) => s.role);
  const created = useCollabStore((s) => s.created);
  const addThread = useCollabStore((s) => s.addThread);
  const items = useMemo(() => feedForCity(citySlug, created), [citySlug, created]);

  // Filtre local au panneau : « Tout » + catégories réellement présentes.
  const [filter, setFilter] = useState<FeedCategory | "all">("all");
  const present = useMemo(() => {
    const set = new Set(items.map((f) => f.category));
    return FEED_CATEGORIES.filter((c) => set.has(c.id));
  }, [items]);
  // Robustesse : si le filtre courant n'est plus présent, retomber sur « Tout ».
  const active: FeedCategory | "all" = filter !== "all" && present.some((c) => c.id === filter) ? filter : "all";
  const visible = useMemo(
    () => (active === "all" ? items : items.filter((f) => f.category === active)),
    [items, active],
  );

  // Pont news -> discussion. addThread est synchrone : le seq courant prédit l'id du
  // fil créé (`sess-t<seq>`), qu'on remonte à l'accueil pour l'afficher. Le fil créé
  // par l'autre compte fait apparaître la pastille de non-lu (mécanique C2).
  const startDiscussion = (item: FeedItem) => {
    const anchor: Anchor = item.impact
      ? { kind: "zone", label: item.impact.zone, zoneId: item.impact.zoneId, route: item.impact.route }
      : GENERAL;
    const focus = item.impact ? item.impact.zone : "l'équipe";
    const text = `À partir de l'info « ${item.title} » (${item.source}) : ${item.summary} Quelle lecture pour ${focus} ?`;
    const seq = useCollabStore.getState().seq;
    addThread({ citySlug, title: item.title, anchor, authorId: role, text });
    onOpenDiscussion(`sess-t${seq}`);
  };

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
        className={`fixed right-0 top-0 z-[1100] flex h-full w-[440px] max-w-[92vw] flex-col border-l border-navy/10 bg-cream-200 shadow-panel transition-transform duration-500 ease-soft will-change-transform ${
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

        {/* Filtres par catégorie */}
        <div className="border-b border-navy/10 px-4 py-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par catégorie">
            <FilterChip label="Tout" active={active === "all"} onClick={() => setFilter("all")} />
            {present.map((c) => (
              <FilterChip key={c.id} label={c.label} active={active === c.id} onClick={() => setFilter(c.id)} />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Compositeur : manager seulement (lecture seule pour l'analyste). */}
          {role === "B" && (
            <div className="mb-3">
              <FeedComposer citySlug={citySlug} />
            </div>
          )}

          <div className="flex flex-col gap-3">
            {visible.map((f) => (
              <FeedCard key={f.id} item={f} citySlug={citySlug} onDiscuss={() => startDiscussion(f)} />
            ))}
            {visible.length === 0 && (
              <p className="px-1 py-8 text-center text-caption text-ink-soft">Aucun item dans cette catégorie.</p>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-1 text-label font-medium transition-colors ${
        active
          ? "border-navy bg-navy text-cream"
          : "border-navy/15 bg-white text-ink-soft hover:border-gold/50 hover:text-navy"
      }`}
    >
      {label}
    </button>
  );
}

function FeedCard({
  item,
  citySlug,
  onDiscuss,
}: {
  item: FeedItem;
  citySlug: string;
  onDiscuss: () => void;
}) {
  const author = item.authorId ? accountOf(item.authorId) : null;
  // Tag cliquable seulement s'il porte une identité de navigation (zoneId).
  const navAnchor: Anchor | null =
    item.impact && item.impact.zoneId
      ? { kind: "zone", label: item.impact.zone, zoneId: item.impact.zoneId, route: item.impact.route }
      : null;

  return (
    <article className="rounded-xl border border-navy/10 bg-white p-4 shadow-card">
      <div className="flex items-center gap-2 text-label uppercase tracking-[0.12em] text-muted">
        <span className="font-semibold text-gold-700">{item.source}</span>
        <span aria-hidden className="text-navy/20">·</span>
        <span>{item.date}</span>
        <span className="ml-auto rounded-full bg-navy/[0.06] px-2 py-0.5 normal-case tracking-normal text-ink-soft">
          {feedCategoryLabel(item.category)}
        </span>
      </div>

      <h3 className="mt-1.5 font-display text-[16px] leading-snug text-navy">{item.title}</h3>
      <p className="mt-1 text-caption text-ink-soft">{item.summary}</p>

      {author && (
        <div className="mt-2 flex items-center gap-1.5 text-label text-muted">
          <Avatar id={item.authorId!} size="sm" />
          <span>
            Publié par <span className="font-medium text-ink">{author.name}</span>
          </span>
        </div>
      )}

      {item.impact && (
        <div className="mt-2.5 flex flex-col items-start gap-1">
          {navAnchor && <AnchorChip anchor={navAnchor} citySlug={citySlug} />}
          {item.impact.note && (
            <p className="text-label text-ink-soft">
              <span className="font-semibold text-navy">Impact :</span> {item.impact.note}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 border-t border-navy/10 pt-3">
        <button
          type="button"
          onClick={onDiscuss}
          className="inline-flex items-center gap-1.5 text-btn font-semibold text-gold-700 transition-colors hover:text-navy"
        >
          <SpeechGlyph />
          Ouvrir une discussion
          <span aria-hidden className="transition-transform">
            →
          </span>
        </button>
      </div>
    </article>
  );
}

// Bulle de discussion fine (trait 1,6), pour l'action « Ouvrir une discussion ».
function SpeechGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 4.5H4A1.5 1.5 0 0 0 2.5 6v10A1.5 1.5 0 0 0 4 17.5h3v3l4-3h9a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 20 4.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
