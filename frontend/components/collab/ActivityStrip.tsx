"use client";

// Fil d'activité compact de l'accueil (lot C1) : dérivé des discussions et du fil
// d'info, en lecture seule. Liste sobre, une ligne par entrée.

import type { ActivityItem } from "@/lib/collab/types";
import { accountOf } from "@/lib/collab/types";
import { resolveText } from "@/lib/collab/i18nText";
import { useT } from "@/lib/i18n/useT";
import { Avatar } from "./Avatar";

export function ActivityStrip({ items }: { items: ActivityItem[] }) {
  const t = useT();
  if (!items.length) return null;
  return (
    <div className="rounded-2xl border border-navy/10 bg-white/70 px-4 py-3 shadow-card">
      <div className="mb-2 text-label font-semibold uppercase tracking-[0.16em] text-muted">{t("col.activity.title")}</div>
      <ul className="flex flex-col gap-2">
        {items.map((a) => (
          <li key={a.id} className="flex items-center gap-2.5">
            <Avatar id={a.authorId} size="sm" />
            <span className="min-w-0 flex-1 truncate text-caption text-ink-soft">
              <span className="font-medium text-ink">{accountOf(a.authorId).name}</span>{" "}
              {resolveText(t, a.text, a.textParams)}
            </span>
            <span className="shrink-0 text-label text-muted">{resolveText(t, a.time, a.timeParams)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
