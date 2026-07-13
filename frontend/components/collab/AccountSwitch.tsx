"use client";

// Bascule de compte « Vu en tant que A / B » (lot C1). Sélecteur de démo sobre,
// dans le coin d'en-tête : pas d'écran de login. Change le compte courant partout
// (store collaboratif). Monté sur fond navy (en-tête de l'accueil).

import { useState } from "react";
import { useCollabStore } from "@/lib/collab/store";
import { ACCOUNT_LIST, accountOf } from "@/lib/collab/types";
import { useT } from "@/lib/i18n/useT";
import { Avatar } from "./Avatar";

export function AccountSwitch() {
  const role = useCollabStore((s) => s.role);
  const setRole = useCollabStore((s) => s.setRole);
  const [open, setOpen] = useState(false);
  const t = useT();
  const current = accountOf(role);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-full border border-cream/15 bg-white/5 py-1 pl-1 pr-3 text-left transition-colors hover:border-gold/50 hover:bg-white/10"
      >
        <Avatar id={role} size="md" />
        <span className="leading-tight">
          <span className="block text-label uppercase tracking-[0.16em] text-cream/55">{t("col.account.seenAs")}</span>
          <span className="block text-btn font-medium text-cream">{current.name}</span>
        </span>
        <span aria-hidden className={`ml-0.5 text-cream/50 transition-transform ${open ? "rotate-180" : ""}`}>
          ⌄
        </span>
      </button>

      {open && (
        <>
          {/* click-away */}
          <div className="fixed inset-0 z-[40]" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="absolute right-0 z-[50] mt-2 w-72 overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-panel"
          >
            <div className="border-b border-navy/10 px-4 py-2.5 text-label uppercase tracking-[0.16em] text-muted">
              {t("col.account.switch")}
            </div>
            {ACCOUNT_LIST.map((a) => {
              const on = a.id === role;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  onClick={() => {
                    setRole(a.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                    on ? "bg-cream-200" : "hover:bg-cream-200"
                  }`}
                >
                  <Avatar id={a.id} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-btn font-medium text-ink">{a.name}</span>
                    <span className="block truncate text-caption text-ink-soft">{t(a.roleLabel)}</span>
                  </span>
                  {on && <span className="text-btn text-gold-700">✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
