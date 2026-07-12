"use client";

// Cadre plein écran de la couche d'entrée (landing, choix pays, choix ville) :
// fond navy profond, texte crème, l'or en accent. Structure seule (lot 1) :
// aucune animation lourde, la transition douce viendra aux lots 2 à 5.

import Link from "next/link";
import { ReactNode } from "react";
import { LangSwitcher } from "@/components/i18n/LangSwitcher";
import { useT } from "@/lib/i18n/useT";

export function Wordmark({ href = "/" }: { href?: string }) {
  const t = useT();
  return (
    <Link href={href} className="group inline-flex flex-col leading-none" aria-label={t("a11y.home")}>
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
  bleed = false,
}: {
  children: ReactNode;
  /** repère d'étape discret en haut à droite (ex. « Pays › Ville ») */
  step?: ReactNode;
  /** plein cadre : le contenu remplit la zone (carte blueprint) au lieu d'être centré */
  bleed?: boolean;
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
      {/* z-20 (au-dessus du main z-10) : le menu déroulant du sélecteur de langue
          doit se peindre par-dessus la carte blueprint. */}
      <header className="relative z-20 flex items-center justify-between px-8 py-6">
        <Wordmark />
        <div className="flex items-center gap-4">
          {step ? <div className="text-label uppercase tracking-[0.22em] text-cream/55">{step}</div> : null}
          <LangSwitcher tone="navy" />
        </div>
      </header>
      {bleed ? (
        <main className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</main>
      ) : (
        <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16">
          {children}
        </main>
      )}
    </div>
  );
}
