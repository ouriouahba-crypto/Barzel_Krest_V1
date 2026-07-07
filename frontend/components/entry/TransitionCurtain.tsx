"use client";

// Rideau navy de la transition carte -> dashboard (lot 4, étendu à l'accueil au
// lot C1). Monté au niveau layout (hors CityKey) : il survit au remontage déclenché
// par le changement de ville, si bien que le glitch de remontage de la carte se joue
// SOUS le navy, invisible. Séquence : l'appelant lève le rideau (`cover()`), puis
// navigue sous le navy ; à l'ARRIVÉE (changement de pathname), le rideau se lève.
// L'uncover est déclenché par le CHANGEMENT de route depuis celle où le rideau a
// été levé (et non plus par « route non-entrée ») : identique pour carte ->
// dashboard, et correct aussi pour accueil -> dashboard, où le départ n'est déjà
// plus une route d'entrée. prefers-reduced-motion : aucun rideau (transition
// instantanée).

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useTransition } from "@/lib/transitionStore";

export function TransitionCurtain() {
  const covering = useTransition((s) => s.covering);
  const uncover = useTransition((s) => s.uncover);
  const path = usePathname();
  const reduce = useReducedMotion();
  // Route au moment où le rideau a été levé : on lève le rideau une fois qu'on
  // l'a quittée (navigation terminée).
  const fromPath = useRef<string | null>(null);

  useEffect(() => {
    if (!covering) {
      fromPath.current = null;
      return;
    }
    if (fromPath.current === null) {
      fromPath.current = path; // capture la route de départ
      return;
    }
    if (path !== fromPath.current) {
      const t = window.setTimeout(() => {
        uncover();
        fromPath.current = null;
      }, 180);
      return () => clearTimeout(t);
    }
  }, [covering, path, uncover]);

  if (reduce) return null;
  return (
    <AnimatePresence>
      {covering && (
        <motion.div
          key="curtain"
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[2000] bg-navy"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
    </AnimatePresence>
  );
}
