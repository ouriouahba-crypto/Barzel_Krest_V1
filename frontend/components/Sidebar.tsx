"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import { MemoModal } from "./MemoModal";
import { useSidebarStore } from "@/lib/sidebarStore";

// Modules du dashboard. Chaque entrée porte une clé stable (indépendante du
// libellé FR) qui sert d'identifiant React ; libellé, icône et route restent
// affichés/utilisés à l'identique.
const MODULES: { key: string; label: string; icon: string; route: string }[] = [
  { key: "overview", label: "Vue d'ensemble", icon: "▦", route: "/vue-ensemble" },
  { key: "map", label: "Carte", icon: "◈", route: "/gaia" },
  { key: "compare", label: "Comparer", icon: "⇄", route: "/comparer" },
  { key: "price-margin", label: "Prix & marge", icon: "€", route: "/prix-marge" },
  { key: "yield", label: "Rendement", icon: "%", route: "/rendement" },
  { key: "arbitrage", label: "Arbitrage", icon: "⇅", route: "/arbitrage" },
  { key: "landbank", label: "Foncier", icon: "▣", route: "/foncier" },
  { key: "tax", label: "Fiscalité", icon: "§", route: "/fiscalite" },
  { key: "energy", label: "Énergie", icon: "⚡", route: "/energie" },
];

// Hydratation avant paint côté client, repli useEffect côté serveur (même
// modèle que CityKey).
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function Sidebar() {
  const pathname = usePathname();
  const [memoOpen, setMemoOpen] = useState(false);
  const open = useSidebarStore((s) => s.open);
  const toggle = useSidebarStore((s) => s.toggle);
  const hydrate = useSidebarStore((s) => s.hydrate);
  useIsoLayoutEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <>
      <aside
        id="dash-sidebar"
        className={`${open ? "w-56" : "w-0"} h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-out motion-reduce:transition-none`}
      >
        <div className="flex h-full w-56 flex-col bg-navy text-cream">
          <div className="flex items-start justify-between px-5 py-5">
            <Link href="/" className="group block" aria-label="Barzel, accueil">
              <div className="font-display text-lg tracking-wide text-gold transition-colors group-hover:text-gold-300">Barzel</div>
              <div className="text-label uppercase tracking-[0.2em] text-cream/60">Analytics</div>
            </Link>
            <button
              type="button"
              onClick={toggle}
              aria-label="Masquer le menu"
              aria-expanded={true}
              aria-controls="dash-sidebar"
              className="-mr-1 flex h-8 w-8 items-center justify-center rounded-lg text-btn text-cream/55 transition-colors hover:bg-white/10 hover:text-gold"
            >
              «
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3">
            {MODULES.map((m) => {
              const href = m.route;
              const on = href ? pathname === href : false;
              const cls = `mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-btn transition-colors ${
                on ? "bg-white/10 text-cream" : href ? "text-cream/70 hover:bg-white/5 hover:text-cream/90" : "cursor-default text-cream/35"
              }`;
              const inner = (
                <>
                  <span className={`w-4 text-center text-btn ${on ? "text-gold" : "text-cream/55"}`}>{m.icon}</span>
                  {m.label}
                </>
              );
              return href ? (
                <Link key={m.key} href={href} className={cls}>
                  {inner}
                </Link>
              ) : (
                <div key={m.key} className={cls} title="Bientôt disponible">
                  {inner}
                </div>
              );
            })}

            <div className="mt-3 border-t border-white/10 pt-3">
              <Link
                href="/ia-analyste"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-btn transition-colors ${
                  pathname === "/ia-analyste" ? "bg-white/10 text-cream" : "text-cream/70 hover:bg-white/5 hover:text-cream/90"
                }`}
              >
                <span className={`w-4 text-center ${pathname === "/ia-analyste" ? "text-gold" : "text-gold/60"}`}>✦</span>
                IA Analyste
              </Link>
            </div>
          </nav>

          <div className="p-3">
            <button
              onClick={() => setMemoOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2.5 text-btn font-medium text-gold transition-colors hover:bg-gold/20"
            >
              <span>⭳</span> Mémo d'investissement
            </button>
          </div>
        </div>
      </aside>

      {!open && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Afficher le menu"
          aria-expanded={false}
          aria-controls="dash-sidebar"
          className="fixed left-3 top-3 z-[1100] flex h-11 w-11 items-center justify-center rounded-lg bg-navy text-lg text-gold shadow-lg transition-colors hover:bg-navy-800"
        >
          ☰
        </button>
      )}

      <MemoModal open={memoOpen} onClose={() => setMemoOpen(false)} />
    </>
  );
}
