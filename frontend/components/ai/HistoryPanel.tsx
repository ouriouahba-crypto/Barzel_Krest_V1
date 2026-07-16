"use client";

import { useMemo } from "react";
import { useChatStore, type ChatKind } from "@/lib/chatStore";
import { useHistoryPanelStore } from "@/lib/historyPanelStore";
import { useLang, useT } from "@/lib/i18n/useT";
import { cityShortName } from "@/lib/i18n/display";
import { localeFor } from "@/lib/i18n/format";

// Panneau d'historique des conversations IA (navy, escamotable, persiste).
// Liste les conversations du `kind` demande, la plus recente en haut. Selectionner
// charge la conversation ; « nouvelle » repart d'une conversation vierge. Ferme, il
// se replie en une bande fine avec un bouton de reouverture (aucun impact sur le
// Header, autonome). Meme sobriete que la Sidebar.

export function HistoryPanel({
  kind,
  activeId,
  onSelect,
  onNew,
}: {
  kind: ChatKind;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const conversations = useChatStore((s) => s.conversations);
  const remove = useChatStore((s) => s.remove);
  const open = useHistoryPanelStore((s) => s.open);
  const toggle = useHistoryPanelStore((s) => s.toggle);

  const list = useMemo(
    () => conversations.filter((c) => c.kind === kind).sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations, kind],
  );

  const fmtDate = (ts: number) => {
    try {
      const d = new Date(ts);
      const day = d.toLocaleDateString(localeFor(lang), { day: "numeric", month: "short" });
      const hm = d.toLocaleTimeString(localeFor(lang), { hour: "2-digit", minute: "2-digit" });
      return `${day} ${hm}`;
    } catch {
      return "";
    }
  };

  return (
    <aside
      className={`${open ? "w-64" : "w-11"} h-full shrink-0 overflow-hidden bg-navy-800 text-cream transition-[width] duration-300 ease-out motion-reduce:transition-none`}
    >
      {open ? (
        <div className="flex h-full w-64 flex-col">
          <div className="flex items-center justify-between px-4 py-4">
            <span className="text-label uppercase tracking-[0.2em] text-cream/55">{t("hist.title")}</span>
            <button
              type="button"
              onClick={toggle}
              aria-label={t("hist.hide")}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-btn text-cream/55 transition-colors hover:bg-white/10 hover:text-gold"
            >
              ‹
            </button>
          </div>
          <div className="px-3">
            <button
              type="button"
              onClick={onNew}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-gold/50 py-2.5 text-btn font-medium text-gold-300 transition-colors hover:border-gold hover:bg-gold/10"
            >
              + {t("hist.new")}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            {list.length === 0 ? (
              <p className="px-2 py-6 text-center text-caption text-cream/45">{t("hist.empty")}</p>
            ) : (
              list.map((c) => (
                <div
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={`group mb-1 cursor-pointer rounded-xl px-3 py-2.5 transition-colors ${
                    c.id === activeId ? "bg-gold/[0.12] ring-1 ring-gold/35" : "hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`line-clamp-2 text-body leading-snug ${c.id === activeId ? "text-gold-300" : "text-cream/85"}`}
                    >
                      {c.title || t("hist.untitled")}
                    </span>
                    <button
                      type="button"
                      aria-label={t("hist.delete")}
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(c.id);
                      }}
                      className="shrink-0 text-lg leading-none text-cream/0 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100 group-hover:text-cream/50"
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-label text-cream/45">{fmtDate(c.updatedAt)}</span>
                    <span className="rounded-full bg-white/[0.07] px-2 py-px text-label text-cream/60">
                      {cityShortName(c.city, lang)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="flex h-full w-11 flex-col items-center py-4">
          <button
            type="button"
            onClick={toggle}
            aria-label={t("hist.show")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-btn text-cream/60 transition-colors hover:bg-white/10 hover:text-gold"
          >
            ☰
          </button>
        </div>
      )}
    </aside>
  );
}
