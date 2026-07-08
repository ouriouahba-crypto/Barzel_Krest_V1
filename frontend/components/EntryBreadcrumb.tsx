"use client";

// Fil d'Ariane du dashboard : « Pays › Ville › Accueil », les segments cliquables
// (remonter au choix ville / pays, ou rouvrir l'accueil ville). Le dashboard lit
// la ville depuis l'état global ; on ne la change plus qu'en repassant par le
// parcours d'entrée.
//
// Lot C2 : une pastille discrète sur le lien « Accueil » signale au compte courant
// du nouveau contenu de discussion (messages postés par l'autre compte depuis sa
// dernière ouverture de l'accueil). Cliquer « Accueil » rouvre la discussion, ce
// qui la marque comme lue et vide la pastille. Rien d'autre n'est ajouté au
// dashboard (on le garde limpide).

import { useEffect } from "react";
import Link from "next/link";
import { countryOf } from "@/lib/cities";
import { useCityStore } from "@/lib/cityStore";
import { useCollabStore, unreadCountForCity } from "@/lib/collab/store";
import { NotifDot } from "./collab/NotifDot";
import { useLang, useT } from "@/lib/i18n/useT";
import { countryDisplay, cityDisplay } from "@/lib/i18n/display";

export function EntryBreadcrumb() {
  const slug = useCityStore((s) => s.slug);
  const lang = useLang();
  const t = useT();
  const countryLabel = countryDisplay(countryOf(slug), lang);
  const cityLabel = cityDisplay(slug, lang);

  // Couche collaborative : hydrate une fois (idempotent, gardé), puis calcule les
  // non-lus du compte courant pour la ville courante. Avant hydratation (et au
  // SSR) l'état est vide -> aucune pastille -> aucun écart d'hydratation.
  const hydrateCollab = useCollabStore((s) => s.hydrate);
  const role = useCollabStore((s) => s.role);
  const created = useCollabStore((s) => s.created);
  const lastSeen = useCollabStore((s) => s.lastSeen);
  useEffect(() => {
    hydrateCollab();
  }, [hydrateCollab]);
  const unread = unreadCountForCity(slug, role, created, lastSeen);

  return (
    <nav aria-label="Fil d'Ariane" className="flex items-center gap-2 text-label uppercase tracking-[0.18em]">
      <Link href="/pays" className="text-muted transition-colors hover:text-gold-700">
        {countryLabel}
      </Link>
      <span aria-hidden className="text-muted/60">
        ›
      </span>
      <Link href="/villes" className="font-semibold text-ink-soft transition-colors hover:text-gold-700">
        {cityLabel}
      </Link>
      {/* Accès permanent à l'accueil ville (discussion + fil d'info). La pastille
          reflète le contenu non lu du compte courant (lot C2). */}
      <span aria-hidden className="text-muted/60">›</span>
      <Link href="/accueil" className="inline-flex items-center gap-1.5 text-muted transition-colors hover:text-gold-700">
        {t("nav.home")}
        <NotifDot count={unread} />
      </Link>
    </nav>
  );
}
