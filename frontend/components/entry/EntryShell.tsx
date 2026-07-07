"use client";

// Cadre plein écran de la couche d'entrée (landing, choix pays, choix ville) :
// fond navy profond, texte crème, l'or en accent. Structure seule (lot 1) :
// aucune animation lourde, la transition douce viendra aux lots 2 à 5.

import Link from "next/link";
import { ReactNode } from "react";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex flex-col leading-none" aria-label="Barzel, accueil">
      <span className="font-display text-xl tracking-wide text-gold transition-colors group-hover:text-gold-300">
        Barzel
      </span>
      <span className="text-label uppercase tracking-[0.28em] text-cream/55">Analytics</span>
    </Link>
  );
}

export function EntryShell({
  children,
  step,
}: {
  children: ReactNode;
  /** repère d'étape discret en haut à droite (ex. « Pays › Ville ») */
  step?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-navy text-cream">
      {/* halo or très discret, décoratif, non animé */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(201,168,106,0.10), transparent 70%), radial-gradient(50% 40% at 100% 100%, rgba(30,53,89,0.55), transparent 70%)",
        }}
      />
      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <Wordmark />
        {step ? <div className="text-label uppercase tracking-[0.22em] text-cream/55">{step}</div> : null}
      </header>
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16">
        {children}
      </main>
    </div>
  );
}
