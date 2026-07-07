"use client";

// Enveloppe de transition de route, rejouée à chaque navigation (lot 4, converti
// en CSS au lot 5 pour être sûr côté hydratation) :
//  - fondu doux du contenu entrant (opacité seule via `.route-fade` : aucune
//    transform, pour ne jamais casser le position:fixed du dashboard) ;
//  - voile navy en fondu sortant (`.route-veil`) quand la route entrante OU
//    sortante appartient au parcours d'entrée : pont sans flash entre le navy de
//    l'entrée et le crème du dashboard (et retour breadcrumb).
// Pure CSS : identique en SSR et au premier rendu client (aucune divergence
// d'hydratation), et neutralisé sous prefers-reduced-motion (rendu direct).
// Le passage carte -> dashboard reste couvert par le rideau (TransitionCurtain).

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const ENTRY_ROUTES = new Set(["/", "/pays", "/villes"]);
let prevPath: string | null = null;

export default function Template({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const bridge = ENTRY_ROUTES.has(path) || (prevPath !== null && ENTRY_ROUTES.has(prevPath));
  useEffect(() => {
    prevPath = path;
  });
  return (
    <div className="route-fade">
      {bridge && <div aria-hidden className="route-veil pointer-events-none fixed inset-0 -z-10 bg-navy" />}
      {children}
    </div>
  );
}
