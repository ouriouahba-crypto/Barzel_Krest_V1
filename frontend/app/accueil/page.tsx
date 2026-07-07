"use client";

// Accueil ville (lot C1) : écran intercalé entre le choix de la ville et le
// dashboard, contextualisé à la ville courante (lue dans le store, comme le
// dashboard). Marque l'accueil comme vu pour la session (play-once) et hydrate le
// compte courant. Contenu 100% seedé, en lecture seule.

import { useEffect } from "react";
import { useCityStore, markAccueilSeen } from "@/lib/cityStore";
import { useCollabStore } from "@/lib/collab/store";
import { AccueilScreen } from "@/components/collab/AccueilScreen";

export default function AccueilPage() {
  const slug = useCityStore((s) => s.slug);
  const ready = useCityStore((s) => s.ready);
  const hydrateCollab = useCollabStore((s) => s.hydrate);

  useEffect(() => {
    hydrateCollab();
  }, [hydrateCollab]);

  // Marque l'accueil de la ville hydratée comme vu (une fois `ready`, pour ne pas
  // marquer le slug par défaut transitoire au rechargement direct de /accueil).
  useEffect(() => {
    if (ready) markAccueilSeen(slug);
  }, [ready, slug]);

  return <AccueilScreen citySlug={slug} />;
}
