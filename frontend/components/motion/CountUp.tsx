"use client";

// <CountUp> : enveloppe d'affichage d'un nombre déjà calculé. Anime de bas vers la
// vraie valeur (rAF) et FINIT EXACTEMENT dessus, au format fourni. Ne touche jamais
// la donnée : `value` vient des props/état de l'appelant, `format` reproduit le
// format existant (mêmes décimales, suffixe, signe). reduced-motion : valeur finale
// directe (géré par useCountUp).

import { useCountUp } from "@/lib/motion";

export function CountUp({
  value,
  format,
  duration,
  enabled,
}: {
  value: number;
  format?: (v: number) => string | number;
  duration?: number;
  enabled?: boolean;
}) {
  const v = useCountUp(value, { duration, enabled });
  const fmt = format ?? ((x: number) => Math.round(x));
  return <>{fmt(v)}</>;
}
