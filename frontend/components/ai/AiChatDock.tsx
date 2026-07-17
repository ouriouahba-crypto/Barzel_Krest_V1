"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { useAiContextStore } from "@/lib/aiContextStore";
import { useChatStore, type ChatMsg } from "@/lib/chatStore";
import { useLang, useT } from "@/lib/i18n/useT";
import { classLabelFor } from "@/lib/i18n/domain";
import { cityShortName } from "@/lib/i18n/display";
import { useCityStore } from "@/lib/cityStore";

// Chat lateral global (dock) : bouton flottant + panneau a droite qui reprend
// l'analyste (meme endpoint /analyst/ask, ville + classe courantes) pour poser
// une question sur ce qu'on voit sans quitter le dashboard.
//
// PAS de panneau d'historique ici, MAIS chaque echange est enregistre dans le
// meme store que la page Analyste (kind "analyst"), donc il apparait dans son
// historique general (et reste reprenable la-bas). Le dock lui-meme ne reprend
// rien au reload : il repart d'un fil vierge, l'historique vit dans le store.
// Il DOIT hydrater le store avant toute ecriture, sinon une premiere question
// ecraserait l'historique persiste. Masque sur les pages d'entree et /ia-analyste.

const HIDE_ON = new Set(["/", "/pays", "/villes", "/accueil", "/ia-analyste"]);

const now = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

// Mise en avant des nombres (or), purement presentationnel.
function renderAnswer(text: string) {
  return text.split(/(\d[\d.,  ]*\s?(?:%|€\/m²(?:\/an)?|€|\/100|pts?|mois)?)/g).map((part, i) =>
    /^\d/.test(part) ? (
      <span key={i} className="font-semibold text-gold-700">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function AiChatDock() {
  const pathname = usePathname();
  const t = useT();
  const lang = useLang();
  const cls = useAiContextStore((s) => s.cls);
  const citySlug = useCityStore((s) => s.slug);

  const conversations = useChatStore((s) => s.conversations);
  const createConv = useChatStore((s) => s.create);
  const appendMsg = useChatStore((s) => s.append);
  const renameConv = useChatStore((s) => s.rename);
  const hydrateChats = useChatStore((s) => s.hydrate);
  useEffect(() => {
    hydrateChats();
  }, [hydrateChats]);

  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  if (HIDE_ON.has(pathname)) return null;

  const messages: ChatMsg[] = activeId
    ? conversations.find((c) => c.id === activeId)?.messages ?? []
    : [];

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    // Conversation partagee (kind analyst) : creee au premier message, ce qui la
    // fait apparaitre dans l'historique de la page Analyste.
    let id = activeId;
    if (!id) {
      id = createConv("analyst", citySlug, cls, lang);
      setActiveId(id);
      renameConv(id, q.length > 60 ? `${q.slice(0, 58)}…` : q);
    }
    setInput("");
    setBusy(true);
    appendMsg(id, { role: "user", text: q, at: now() });
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 60);
    try {
      const r = await api.analystAsk(q, cls, lang);
      appendMsg(id, { role: "assistant", text: r.answer, at: now() });
    } catch {
      appendMsg(id, { role: "error", text: t("ai.error"), at: now() });
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 60);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("dock.open")}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-navy text-gold shadow-[0_10px_30px_rgba(10,22,40,0.35)] ring-1 ring-gold/40 transition-transform hover:scale-105"
      >
        <IconChat />
      </button>
    );
  }

  return (
    <aside className="fixed right-0 top-0 z-[1100] flex h-screen w-full max-w-[400px] flex-col border-l border-navy/10 bg-cream-200 shadow-[-16px_0_50px_rgba(10,22,40,0.18)]">
      <div className="flex items-center justify-between bg-navy px-5 py-3.5">
        <div>
          <div className="text-label uppercase tracking-[0.2em] text-gold">{t("ai.analyst_label")}</div>
          <div className="text-label text-cream/55">
            {cityShortName(citySlug, lang)} · {classLabelFor(cls, lang).toLowerCase()}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveId(null)}
              className="rounded-lg px-2 py-1 text-label text-cream/55 transition-colors hover:bg-white/10 hover:text-gold"
            >
              {t("dock.new")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("dock.close")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-cream/60 transition-colors hover:bg-white/10 hover:text-gold"
          >
            ×
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 && !busy ? (
          <p className="mt-6 text-center text-body text-ink-soft">{t("dock.hint")}</p>
        ) : (
          <div className="flex flex-col gap-5">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="self-end text-right">
                  <div className="inline-block max-w-[85%] rounded-2xl border border-navy/10 bg-white px-4 py-2 text-left text-body text-ink shadow-sm">
                    {m.text}
                  </div>
                  <div className="mt-1 pr-1 text-label text-muted">{m.at}</div>
                </div>
              ) : m.role === "assistant" ? (
                <div key={i} className="self-start border-l-2 border-gold pl-4">
                  <div className="text-label font-semibold uppercase tracking-widest text-gold-700">
                    {t("ai.analyst_label")} · {m.at}
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-body text-ink">{renderAnswer(m.text)}</p>
                </div>
              ) : (
                <div key={i} className="self-start rounded-xl border border-navy/10 bg-white px-3 py-2 text-caption italic text-ink-soft">
                  {m.text}
                </div>
              ),
            )}
            {busy && <div className="self-start border-l-2 border-gold/50 pl-4 text-label text-muted">{t("ai.typing")}</div>}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form
        className="shrink-0 border-t border-navy/10 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <div className="flex items-center gap-2 rounded-full border border-navy/10 bg-white py-1.5 pl-4 pr-1.5 transition-shadow focus-within:border-gold/60 focus-within:ring-2 focus-within:ring-gold/40">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("dock.placeholder")}
            className="min-w-0 flex-1 bg-transparent py-1.5 text-body text-ink outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label={t("ai.send")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-gold transition-colors hover:bg-navy-800 disabled:opacity-40"
          >
            <IconArrow />
          </button>
        </div>
      </form>
    </aside>
  );
}

function IconChat() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3H6a2 2 0 0 1-2-2V6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconArrow() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M12 19V5M12 5l-6 6M12 5l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
