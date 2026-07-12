"use client";

// Bouton « Entrer dans le dashboard » de l'accueil (lot C1). Reprend la transition
// continue du lot 4 : on lève le rideau navy (cover), puis on navigue sous le navy
// (le rideau se lève à l'arrivée sur le dashboard). Aucun flash. Sous
// prefers-reduced-motion : navigation immédiate (le rideau est neutralisé).

import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { useTransition } from "@/lib/transitionStore";
import { useT } from "@/lib/i18n/useT";

const DASHBOARD_HOME = "/vue-ensemble";
// Même délai que MapEntry : laisse le rideau navy devenir opaque avant de naviguer.
const COVER_MS = 360;

export function EnterDashboardButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const t = useT();
  const cover = useTransition((s) => s.cover);
  const reduce = useReducedMotion();

  const go = () => {
    if (reduce) {
      router.push(DASHBOARD_HOME);
      return;
    }
    cover();
    window.setTimeout(() => router.push(DASHBOARD_HOME), COVER_MS);
  };

  return (
    <button
      type="button"
      onClick={go}
      className={`group inline-flex items-center gap-3 rounded-full bg-navy px-7 py-3 text-btn font-semibold uppercase tracking-[0.14em] text-cream shadow-card transition-colors hover:bg-navy-700 ${className}`}
    >
      {t("col.enter.cta")}
      <span aria-hidden className="text-gold transition-transform group-hover:translate-x-1">
        →
      </span>
    </button>
  );
}
