import Link from "next/link";
import { EntryShell } from "@/components/entry/EntryShell";

// Landing Barzel (plus le dashboard) : point d'entrée du parcours pays puis
// ville. Structure et navigation seules (lot 1) : la mise en mouvement premium
// arrive aux lots suivants.

export default function Landing() {
  return (
    <EntryShell>
      <div className="fade-up mx-auto max-w-3xl text-center">
        <p className="text-label uppercase tracking-[0.32em] text-gold/80">Intelligence immobilière</p>
        <h1 className="mt-6 font-display text-[clamp(38px,7vw,68px)] font-medium leading-[1.05] text-cream">
          Lire un marché
          <br />
          par la décision.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-insight text-cream/85">
          Barzel évalue chaque territoire selon quatre lectures d'investissement (promotion, détention,
          arbitrage, foncier) et en tire un verdict actionnable, ville par ville.
        </p>
        <div className="mt-10 flex items-center justify-center">
          <Link
            href="/pays"
            className="group inline-flex items-center gap-3 rounded-full border border-gold/50 bg-gold/10 px-8 py-3.5 text-btn font-semibold uppercase tracking-[0.14em] text-gold-300 transition-colors hover:border-gold hover:bg-gold/20"
          >
            Entrer
            <span aria-hidden className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>
      </div>
    </EntryShell>
  );
}
