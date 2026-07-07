"use client";

// Chip d'objet d'un fil de discussion (lot C3). Cliquable, il RAMÈNE à l'objet dans
// le dashboard :
//  - ancre de maille (zoneId) : ouvre la carte et focalise la maille (via le pont
//    focusBridge, consommé une fois à l'arrivée) ;
//  - ancre de verdict/actif portant une route : ouvre la page du mode concernée ;
//  - à défaut (seed « général ville », fils sans cible) : la vue d'ensemble.
// Reprend le rideau d'entrée du dashboard (comme « Entrer dans le dashboard »),
// neutralisé sous prefers-reduced-motion (navigation immédiate).

import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { useTransition } from "@/lib/transitionStore";
import { setPendingFocus } from "@/lib/collab/focusBridge";
import type { Anchor, AnchorKind } from "@/lib/collab/types";

const GLYPH: Record<AnchorKind, string> = { zone: "▣", asset: "◈", verdict: "◆", general: "◇" };
const KIND_LABEL: Record<AnchorKind, string> = {
  zone: "Maille",
  asset: "Actif",
  verdict: "Verdict",
  general: "Général",
};
// Même délai que MapEntry / EnterDashboardButton : le rideau devient opaque avant nav.
const COVER_MS = 360;

export function AnchorChip({ anchor, citySlug }: { anchor: Anchor; citySlug: string }) {
  const router = useRouter();
  const cover = useTransition((s) => s.cover);
  const reduce = useReducedMotion();
  const route = anchor.route ?? "/vue-ensemble";

  const go = () => {
    if (anchor.zoneId) setPendingFocus(citySlug, anchor.zoneId);
    if (reduce) {
      router.push(route);
      return;
    }
    cover();
    window.setTimeout(() => router.push(route), COVER_MS);
  };

  return (
    <button
      type="button"
      onClick={go}
      title="Revenir à l'objet dans le dashboard"
      className="group mb-1.5 inline-flex max-w-full items-center gap-1.5 self-start rounded-full border border-gold/20 bg-gold/[0.08] px-2.5 py-1 text-label font-medium text-gold-700 transition-colors hover:border-gold/50 hover:bg-gold/[0.14]"
    >
      <span aria-hidden>{GLYPH[anchor.kind] ?? GLYPH.general}</span>
      <span className="uppercase tracking-[0.12em]">{KIND_LABEL[anchor.kind] ?? KIND_LABEL.general}</span>
      <span className="text-gold-700/70">·</span>
      <span className="truncate normal-case tracking-normal">{anchor.label}</span>
      <span aria-hidden className="text-gold-700/50 transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </button>
  );
}
