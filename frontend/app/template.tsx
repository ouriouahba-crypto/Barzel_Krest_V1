"use client";

// Enveloppe de transition de route (lot 4), rejouée à chaque navigation :
//  - fondu doux du contenu entrant (opacité seule : aucune transform, pour ne
//    jamais casser le position:fixed du dashboard, ex. DetailPanel / panes Leaflet) ;
//  - voile navy en fondu sortant quand la route entrante OU sortante appartient au
//    parcours d'entrée (navy) : pont sans flash entre le navy de l'entrée et le
//    crème du dashboard (et retour breadcrumb).
// Le passage carte -> dashboard est couvert en plus par le rideau (TransitionCurtain),
// qui masque le remontage. prefers-reduced-motion : rendu direct, sans animation.

import { motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const ENTRY_ROUTES = new Set(["/", "/pays", "/villes"]);
let prevPath: string | null = null;

export default function Template({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const reduce = useReducedMotion();
  const bridge = ENTRY_ROUTES.has(path) || (prevPath !== null && ENTRY_ROUTES.has(prevPath));
  useEffect(() => {
    prevPath = path;
  });

  if (reduce) return <>{children}</>;
  return (
    <>
      {bridge && (
        <motion.div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-navy"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
        {children}
      </motion.div>
    </>
  );
}
