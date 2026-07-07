"use client";

// Accueil ville (lots C1 et C2) : écran intercalé entre le choix de la ville et le
// dashboard, contextualisé à la ville courante (lue dans le store, comme le
// dashboard). Marque l'accueil comme vu pour la session (play-once) et hydrate le
// compte courant. Depuis le C2, l'ouverture de l'accueil marque aussi la
// discussion comme LUE pour le compte courant (vide la pastille de non-lu).

import { useEffect } from "react";
import { useCityStore, markAccueilSeen } from "@/lib/cityStore";
import { useCollabStore } from "@/lib/collab/store";
import { AccueilScreen } from "@/components/collab/AccueilScreen";

export default function AccueilPage() {
  const slug = useCityStore((s) => s.slug);
  const ready = useCityStore((s) => s.ready);
  const hydrateCollab = useCollabStore((s) => s.hydrate);
  const collabHydrated = useCollabStore((s) => s.hydrated);
  const markSeen = useCollabStore((s) => s.markSeen);

  useEffect(() => {
    hydrateCollab();
  }, [hydrateCollab]);

  // Marque l'accueil de la ville hydratée comme vu (une fois `ready`, pour ne pas
  // marquer le slug par défaut transitoire au rechargement direct de /accueil).
  useEffect(() => {
    if (ready) markAccueilSeen(slug);
  }, [ready, slug]);

  // Ouvrir l'accueil marque la discussion comme lue pour le compte COURANT AU
  // MONTAGE (dépendances volontairement sans `role` : basculer de compte en
  // restant sur l'accueil fait apparaître la pastille du nouveau compte, qui se
  // videra à la prochaine ouverture). Gardé par l'hydratation collab (sinon on
  // marquerait le rôle par défaut transitoire avant lecture du sessionStorage).
  useEffect(() => {
    if (ready && collabHydrated) markSeen(slug, useCollabStore.getState().role);
  }, [ready, collabHydrated, slug, markSeen]);

  return <AccueilScreen citySlug={slug} />;
}
