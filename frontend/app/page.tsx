"use client";

import Link from "next/link";
import { EntryShell } from "@/components/entry/EntryShell";
import { KrestLogo } from "@/components/brand/KrestLogo";
import { useT } from "@/lib/i18n/useT";

// Landing Barzel (plus le dashboard) : point d'entrée du parcours pays puis
// ville. Le logo Barzel remplace le bloc titre texte ; le fond navy et le
// bouton d'entrée restent inchangés. Composant client : le libellé du bouton
// d'entrée passe par t() (i18n).

export default function Landing() {
  const t = useT();
  return (
    <EntryShell>
      <div className="fade-up mx-auto max-w-3xl text-center">
        <KrestLogo className="mx-auto h-auto w-[clamp(320px,40vw,420px)] text-cream" />
        <p className="mt-6 text-label uppercase tracking-[0.28em] text-cream/55">
          Powered by Barzel Analytics
        </p>
        <div className="mt-12 flex items-center justify-center">
          <Link
            href="/pays"
            className="group inline-flex items-center gap-3 rounded-full border border-gold/50 bg-gold/10 px-8 py-3.5 text-btn font-semibold uppercase tracking-[0.14em] text-gold-300 transition-colors hover:border-gold hover:bg-gold/20"
          >
            {t("entry.enter")}
            <span aria-hidden className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>
      </div>
    </EntryShell>
  );
}
