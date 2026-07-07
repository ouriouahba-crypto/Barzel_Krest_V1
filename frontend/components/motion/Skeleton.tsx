"use client";

// Placeholder à shimmer discret pendant les fetchs (lot 5). Le shimmer est une
// animation CSS (globals.css `.shimmer`) neutralisée par prefers-reduced-motion
// via la règle globale de réduction d'animation. Remplacé par le contenu à
// l'arrivée, sans saut de layout (dimensionner via className).

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`shimmer rounded-md bg-navy/[0.06] ${className}`} />;
}
