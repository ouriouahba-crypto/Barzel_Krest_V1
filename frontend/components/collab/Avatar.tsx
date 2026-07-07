"use client";

// Avatar par initiales (lot C1). Deux styles distincts selon le rôle : l'analyste
// (A) sur navy, la direction (B) sur or. Palette de la charte, jamais de blanc sur
// or (navy sur or pour B, or clair sur navy pour A).

import { accountOf, type AccountId } from "@/lib/collab/types";

const SIZE = {
  sm: "h-6 w-6 text-label",
  md: "h-8 w-8 text-btn",
  lg: "h-10 w-10 text-body",
} as const;

export function Avatar({ id, size = "md" }: { id: AccountId; size?: keyof typeof SIZE }) {
  const account = accountOf(id);
  const style = id === "A" ? "bg-navy text-gold-300" : "bg-gold text-navy";
  return (
    <span
      aria-hidden
      title={account.name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZE[size]} ${style}`}
    >
      {account.initials}
    </span>
  );
}
