"use client";

// Écran d'accueil ville (lots C1 et C2). Contextualisé à la ville courante :
//  - en-tête navy : wordmark, fil d'Ariane (pastille de non-lu sur « Accueil »),
//    bascule de compte, ouverture du fil d'info ;
//  - corps crème : titre de ville, fil d'activité compact, DISCUSSION d'équipe
//    (compositeur de nouveau fil + fils répondables), et l'accès au dashboard ;
//  - panneau latéral droit : le FIL D'INFO (slide-in, lecture seule).
// C2 rend la discussion interactive (répondre, démarrer un fil, notifications).
// Le fil d'info actif (post manager, filtres) reste pour le lot C4.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { COUNTRY_LABEL, cityBySlug, countryOf } from "@/lib/cities";
import {
  useCollabStore,
  activityForCity,
  feedForCity,
  threadsForCity,
  threadUnreadCount,
  unreadCountForCity,
} from "@/lib/collab/store";
import { AccountSwitch } from "./AccountSwitch";
import { ActivityStrip } from "./ActivityStrip";
import { DiscussionThread } from "./DiscussionThread";
import { NewThreadComposer } from "./NewThreadComposer";
import { NotifDot } from "./NotifDot";
import { FeedPanel } from "./FeedPanel";
import { EnterDashboardButton } from "./EnterDashboardButton";

export function AccueilScreen({ citySlug }: { citySlug: string }) {
  const city = cityBySlug(citySlug);
  const created = useCollabStore((s) => s.created);
  const role = useCollabStore((s) => s.role);
  const lastSeen = useCollabStore((s) => s.lastSeen);
  const [feedOpen, setFeedOpen] = useState(false);
  // Fil mis en avant par le pont news -> discussion (lot C4) : on ferme le panneau,
  // on défile jusqu'au fil créé et on le souligne brièvement.
  const [focusThreadId, setFocusThreadId] = useState<string | null>(null);
  const reduce = useReducedMotion();

  const threads = useMemo(() => threadsForCity(citySlug, created), [citySlug, created]);
  const feed = useMemo(() => feedForCity(citySlug, created), [citySlug, created]);
  const activity = useMemo(() => activityForCity(citySlug, created), [citySlug, created]);
  // Non-lus pour le compte courant (messages postés par l'autre compte depuis sa
  // dernière consultation). Vidés au montage de l'accueil (voir la page).
  const unread = useMemo(
    () => unreadCountForCity(citySlug, role, created, lastSeen),
    [citySlug, role, created, lastSeen],
  );

  // Défilement + surlignage du fil ciblé, une fois qu'il est rendu (le store a déjà
  // ajouté le fil, donc l'élément existe au moment de l'effet). Surlignage transitoire.
  useEffect(() => {
    if (!focusThreadId) return;
    const el = document.getElementById(`thread-${focusThreadId}`);
    if (el) el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    const t = window.setTimeout(() => setFocusThreadId(null), 2600);
    return () => window.clearTimeout(t);
  }, [focusThreadId, reduce]);

  // Pont depuis le fil d'info : referme le panneau et met le fil créé en avant.
  const openDiscussion = (threadId: string) => {
    setFeedOpen(false);
    setFocusThreadId(threadId);
  };

  return (
    <div className="flex min-h-screen flex-col bg-cream text-ink">
      {/* En-tête navy */}
      <header className="flex items-center justify-between gap-4 bg-navy px-6 py-4 text-cream">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/" className="group inline-flex flex-col leading-none" aria-label="Barzel, accueil">
            <span className="font-display text-lg tracking-wide text-gold transition-colors group-hover:text-gold-300">Barzel</span>
            <span className="text-label uppercase tracking-[0.24em] text-cream/55">Analytics</span>
          </Link>
          <nav aria-label="Fil d'Ariane" className="hidden items-center gap-2 text-label uppercase tracking-[0.16em] sm:flex">
            <Link href="/pays" className="text-cream/55 transition-colors hover:text-gold-300">
              {COUNTRY_LABEL[countryOf(citySlug)]}
            </Link>
            <span aria-hidden className="text-cream/30">›</span>
            <Link href="/villes" className="text-cream/70 transition-colors hover:text-gold-300">
              {city.label}
            </Link>
            <span aria-hidden className="text-cream/30">›</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-cream">
              Accueil
              <NotifDot count={unread} />
            </span>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setFeedOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-cream/15 bg-white/5 px-3.5 py-2 text-btn text-cream transition-colors hover:border-gold/50 hover:bg-white/10"
          >
            <span aria-hidden className="text-gold">▤</span>
            Fil d'info
            <span className="rounded-full bg-gold/20 px-1.5 text-label font-semibold text-gold-300">{feed.length}</span>
          </button>
          <AccountSwitch />
        </div>
      </header>

      {/* Corps crème */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        {/* Titre de ville + accès dashboard */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-label uppercase tracking-[0.28em] text-gold-700">Espace d'équipe</p>
            <h1 className="mt-2 font-display text-[clamp(30px,4vw,44px)] leading-none text-navy">{city.label}</h1>
            <p className="mt-2 max-w-2xl text-insight text-ink-soft">
              Discussion d'équipe, fil d'info et signaux de marché, avant d'entrer dans l'analyse.
            </p>
          </div>
          <EnterDashboardButton />
        </div>

        {/* Fil d'activité compact */}
        <div className="mt-6">
          <ActivityStrip items={activity} />
        </div>

        {/* Discussion de l'équipe */}
        <section className="mt-8">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-[24px] text-navy">Discussion de l'équipe</h2>
              {unread > 0 && <NotifDot count={unread} showCount />}
            </div>
            <span className="text-label uppercase tracking-[0.14em] text-muted">
              {threads.length} {threads.length > 1 ? "fils" : "fil"}
            </span>
          </div>
          {/* Compositeur de nouveau fil, en tête de la discussion. */}
          <div className="mb-4">
            <NewThreadComposer citySlug={citySlug} />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {threads.map((t) => (
              <DiscussionThread
                key={t.id}
                thread={t}
                unread={threadUnreadCount(t, role, citySlug, lastSeen)}
                highlight={t.id === focusThreadId}
              />
            ))}
          </div>
        </section>
      </main>

      <FeedPanel
        open={feedOpen}
        onClose={() => setFeedOpen(false)}
        citySlug={citySlug}
        onOpenDiscussion={openDiscussion}
      />
    </div>
  );
}
