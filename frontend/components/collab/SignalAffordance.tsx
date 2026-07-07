"use client";

// Affordance de SIGNALEMENT au survol (lot C3). Purement additive : une couche
// d'overlay déposée dans un hôte du dashboard marqué `group/sig relative` (une
// ligne de maille, une carte de verdict, le panneau de la carte). Elle ne touche
// NI la donnée, NI le calcul, NI les valeurs affichées.
//
//  - AU REPOS : rien (l'icône est en opacity-0, absolue, sans décalage de layout).
//  - AU SURVOL de l'objet : une petite icône « noter » apparaît au coin.
//  - CLIC : ouvre un popover compact (champ + envoyer). stopPropagation : le clic
//    n'active jamais l'objet sous-jacent (tri, ouverture de zone, marqueur…).
//  - ENVOI : la note remonte dans la DISCUSSION de la ville (store collab), ancrée
//    à l'objet, et déclenche la pastille de non-lu pour l'autre compte (mécanisme
//    C2). Échap / clic dehors / Annuler : ferme sans rien créer.
//
// Accessibilité : l'icône reste atteignable au clavier (focus-visible), le popover
// est un dialog étiqueté. prefers-reduced-motion : le fondu d'apparition est
// neutralisé par la règle globale (et `motion-reduce:transition-none`).

import { useEffect, useRef, useState } from "react";
import { useCollabStore } from "@/lib/collab/store";
import { accountOf, type Anchor, type AnchorKind } from "@/lib/collab/types";

const GLYPH: Record<AnchorKind, string> = { zone: "▣", asset: "◈", verdict: "◆", general: "◇" };

// Coin du bouton flottant, légèrement HORS de l'hôte pour ne jamais recouvrir son
// contenu (score, pastille « Dominant », etc.). Absolu -> aucun décalage de layout.
const PLACE: Record<"tr" | "br", string> = {
  tr: "-top-2 -right-2",
  br: "-bottom-2 -right-2",
};

export function SignalAffordance({
  anchor,
  citySlug,
  place = "tr",
}: {
  anchor: Anchor;
  citySlug: string;
  place?: "tr" | "br";
}) {
  const [open, setOpen] = useState(false);
  // Snapshot de l'ancre à l'ouverture : si l'hôte se met à jour (le panneau de la
  // carte suit le survol), le popover garde la cible choisie au clic.
  const [snap, setSnap] = useState<Anchor | null>(null);

  const openPopover = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSnap(anchor);
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        aria-label={`Signaler à l'équipe : ${anchor.label}`}
        title="Signaler à l'équipe"
        onClick={openPopover}
        className={`absolute ${PLACE[place]} z-20 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-navy opacity-0 shadow-sm ring-1 ring-navy/15 transition-opacity duration-150 hover:text-gold-700 hover:ring-gold/60 focus-visible:opacity-100 group-hover/sig:opacity-100 motion-reduce:transition-none ${
          open ? "opacity-100" : ""
        }`}
      >
        <SignalGlyph />
      </button>
      {open && snap && <SignalPopover anchor={snap} citySlug={citySlug} onClose={() => setOpen(false)} />}
    </>
  );
}

function SignalPopover({
  anchor,
  citySlug,
  onClose,
}: {
  anchor: Anchor;
  citySlug: string;
  onClose: () => void;
}) {
  const role = useCollabStore((s) => s.role);
  const addSignal = useCollabStore((s) => s.addSignal);
  const current = accountOf(role);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Échap et clic à l'extérieur ferment (annulent). Le clic sur le bouton d'ouverture
  // vient d'un stopPropagation, donc ne rouvre/ferme pas en boucle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  // Confirmation brève puis fermeture (timeout neutre, pas d'animation).
  useEffect(() => {
    if (!sent) return;
    const t = window.setTimeout(onClose, 1500);
    return () => window.clearTimeout(t);
  }, [sent, onClose]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    addSignal({ citySlug, anchor, authorId: role, text: body });
    setSent(true);
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Signaler : ${anchor.label}`}
      onClick={(e) => e.stopPropagation()}
      className="fade-up absolute right-0 top-full z-30 mt-2 w-[260px] rounded-2xl border border-navy/10 bg-white p-3.5 text-left text-ink shadow-card"
    >
      <div className="mb-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-gold/20 bg-gold/[0.08] px-2.5 py-1 text-label font-medium text-gold-700">
        <span aria-hidden>{GLYPH[anchor.kind] ?? GLYPH.general}</span>
        <span className="truncate normal-case">{anchor.label}</span>
      </div>

      {sent ? (
        <p className="py-1.5 text-body text-ink-soft">
          <span className="font-semibold text-navy">Remonté dans la discussion.</span> Visible par l'équipe.
        </p>
      ) : (
        <>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={3}
            aria-label={`Noter en tant que ${current.name}`}
            placeholder={`Noter en tant que ${current.name}...`}
            className="w-full resize-none rounded-xl border border-navy/15 bg-cream/40 px-3 py-2 text-body text-ink placeholder:text-muted focus:border-gold/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gold/25"
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-2.5 py-1 text-btn font-medium text-ink-soft transition-colors hover:text-navy"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={send}
              disabled={!text.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-navy px-3.5 py-1.5 text-btn font-semibold text-cream transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Signaler
              <span aria-hidden className="text-gold">
                →
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Icône fine « ajouter une note » : bulle de discussion + plus. Trait 1,6.
function SignalGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 4.5H4A1.5 1.5 0 0 0 2.5 6v10A1.5 1.5 0 0 0 4 17.5h3v3l4-3h9a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 20 4.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 8v5M9.5 10.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
