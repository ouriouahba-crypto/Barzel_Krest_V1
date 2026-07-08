"use client";

// Selecteur de langue compact : bouton (code courant EN/FR/PT + glyphe globe),
// menu deroulant des endonymes (LANGS). Ferme au clic exterieur et a Echap.
// Prop `tone` : "navy" (fond navy, texte creme/or, ecran d'entree) ou "cream"
// (fond clair, texte navy/or-700, header dashboard). Aucune animation superflue
// (rien a garder pour prefers-reduced-motion : pas de transform, pas d'entree
// animee ; seules des transitions de couleur au survol).

import { useEffect, useRef, useState } from "react";
import { useLangStore } from "@/lib/langStore";
import { LANGS } from "@/lib/i18n";
import { useT } from "@/lib/i18n/useT";

export function LangSwitcher({ tone = "cream" }: { tone?: "navy" | "cream" }) {
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onNavy = tone === "navy";
  const btnCls = onNavy
    ? "border-cream/20 text-cream/80 hover:border-gold/50 hover:text-gold-300"
    : "border-navy/15 text-navy hover:border-gold/50 hover:text-gold-700";
  const menuCls = onNavy ? "border-cream/15 bg-navy-800 text-cream" : "border-navy/10 bg-white text-navy";
  const itemHover = onNavy ? "hover:bg-white/10" : "hover:bg-navy/5";
  const activeCls = onNavy ? "text-gold-300" : "text-gold-700";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("lang.aria")}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-btn font-medium uppercase tracking-wide transition-colors ${btnCls}`}
      >
        <span aria-hidden className="text-btn leading-none opacity-80">
          🌐
        </span>
        {lang}
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={t("lang.aria")}
          className={`absolute right-0 z-[1200] mt-1.5 min-w-[9rem] overflow-hidden rounded-lg border py-1 shadow-lg ${menuCls}`}
        >
          {LANGS.map((l) => {
            const active = l.code === lang;
            return (
              <li key={l.code} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    setLang(l.code);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-btn transition-colors ${itemHover} ${active ? activeCls : ""}`}
                >
                  <span>{l.endonym}</span>
                  <span aria-hidden className="text-label uppercase tracking-wide opacity-60">
                    {l.code}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
