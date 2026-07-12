"use client";

// Pastille de notification (lot C2). Point or discret, avec un halo qui pulse
// doucement pour attirer l'oeil sans bruit. Le halo est neutralisé sous
// prefers-reduced-motion par la règle globale (animation-duration -> 0.001ms).
// Deux tailles : `dot` (point nu, pour le fil d'Ariane) et `count` (avec un
// nombre, pour un en-tête de section).

import { useT } from "@/lib/i18n/useT";

export function NotifDot({ count, showCount = false }: { count: number; showCount?: boolean }) {
  const t = useT();
  if (count <= 0) return null;
  if (showCount) {
    return (
      <span
        role="status"
        aria-label={t(count > 1 ? "col.notif.newMessages" : "col.notif.newMessage", { count })}
        className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-gold px-1.5 py-0.5 text-label font-semibold leading-none text-navy"
      >
        {count}
      </span>
    );
  }
  return (
    <span role="status" aria-label={t("col.notif.newContent")} className="relative inline-flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold/70" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-gold ring-2 ring-navy" />
    </span>
  );
}
