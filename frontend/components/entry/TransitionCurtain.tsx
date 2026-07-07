"use client";

// Rideau navy de la transition carte -> dashboard (lot 4). Monté au niveau layout
// (hors CityKey) : il survit au remontage déclenché par le changement de ville, si
// bien que le glitch de remontage de la carte se joue SOUS le navy, invisible.
// Séquence : la carte appelle `cover()` (rideau en fondu navy), puis pose la ville
// et navigue sous le navy ; à l'arrivée sur le dashboard, le rideau se lève.
// prefers-reduced-motion : aucun rideau (transition instantanée).

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useTransition } from "@/lib/transitionStore";

const ENTRY_ROUTES = new Set(["/", "/pays", "/villes"]);

export function TransitionCurtain() {
  const covering = useTransition((s) => s.covering);
  const uncover = useTransition((s) => s.uncover);
  const path = usePathname();
  const reduce = useReducedMotion();

  useEffect(() => {
    // Arrivé hors du parcours d'entrée (dashboard peint) : on lève le rideau.
    if (covering && !ENTRY_ROUTES.has(path)) {
      const t = window.setTimeout(uncover, 180);
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
