"use client";

// Révélation cinétique discrète d'un titre (lot 5) : fondu + léger rise (CSS
// `.title-reveal`), rejoué quand le texte change (clé sur `text`, ex. nom de ville
// du dashboard). Pure CSS : aucune divergence d'hydratation SSR/client, et
// neutralisé sous prefers-reduced-motion. La police de marque (Playfair) est
// conservée.

import { MOTION } from "@/lib/motion";

export function KineticTitle({ text, className }: { text: string; className?: string }) {
  if (!MOTION.enableTitleReveal) return <span className={className}>{text}</span>;
  return (
    <span key={text} className={`inline-block title-reveal ${className ?? ""}`}>
      {text}
    </span>
  );
}
