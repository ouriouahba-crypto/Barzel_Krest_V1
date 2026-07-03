"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MemoModal } from "./MemoModal";

const ICONS: Record<string, string> = {
  "Vue d'ensemble": "▦",
  Carte: "◈",
  Comparer: "⇄",
  "Prix & marge": "€",
  Rendement: "%",
  Arbitrage: "⇅",
  Foncier: "▣",
  Fiscalité: "§",
  Énergie: "⚡",
};

// Modules with a real route; the rest are placeholders (anchors to build later).
const ROUTES: Record<string, string> = {
  "Vue d'ensemble": "/vue-ensemble",
  Carte: "/gaia",
  Comparer: "/comparer",
  "Prix & marge": "/prix-marge",
  Rendement: "/rendement",
  Arbitrage: "/arbitrage",
  Foncier: "/foncier",
  Fiscalité: "/fiscalite",
  Énergie: "/energie",
};
const MODULES = ["Vue d'ensemble", "Carte", "Comparer", "Prix & marge", "Rendement", "Arbitrage", "Foncier", "Fiscalité", "Énergie"];

export function Sidebar() {
  const pathname = usePathname();
  const [memoOpen, setMemoOpen] = useState(false);
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col bg-navy text-cream">
      <div className="px-5 py-5">
        <div className="font-display text-lg tracking-wide text-gold">Barzel</div>
        <div className="text-[11px] uppercase tracking-[0.2em] text-cream/40">Analytics</div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3">
        {MODULES.map((m) => {
          const href = ROUTES[m];
          const on = href ? pathname === href : false;
          const cls = `mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
            on ? "bg-white/10 text-cream" : href ? "text-cream/60 hover:bg-white/5 hover:text-cream/90" : "cursor-default text-cream/35"
          }`;
          const inner = (
            <>
              <span className={`w-4 text-center text-[13px] ${on ? "text-gold" : "text-cream/40"}`}>{ICONS[m]}</span>
              {m}
            </>
          );
          return href ? (
            <Link key={m} href={href} className={cls}>
              {inner}
            </Link>
          ) : (
            <div key={m} className={cls} title="Bientôt disponible">
              {inner}
            </div>
          );
        })}

        <div className="mt-3 border-t border-white/10 pt-3">
          <Link
            href="/ia-analyste"
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors ${
              pathname === "/ia-analyste" ? "bg-white/10 text-cream" : "text-cream/60 hover:bg-white/5 hover:text-cream/90"
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
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2.5 text-[13px] font-medium text-gold transition-colors hover:bg-gold/20"
        >
          <span>⭳</span> Mémo d'investissement
        </button>
      </div>
      <MemoModal open={memoOpen} onClose={() => setMemoOpen(false)} />
    </aside>
  );
}
