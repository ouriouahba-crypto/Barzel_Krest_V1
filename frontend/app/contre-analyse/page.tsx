"use client";

import { useEffect, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { Segmented } from "@/components/ui";
import { DocDropzone } from "@/components/ai/DocDropzone";
import { HistoryPanel } from "@/components/ai/HistoryPanel";
import { api } from "@/lib/api";
import { cityBySlug } from "@/lib/cities";
import { useCityStore } from "@/lib/cityStore";
import { useChatStore, type ChatMsg } from "@/lib/chatStore";
import { useHistoryPanelStore } from "@/lib/historyPanelStore";
import { assetClassesFor, classLabelFor } from "@/lib/i18n/domain";
import { useLang, useT } from "@/lib/i18n/useT";

// Contre-analyse : on soumet un document externe (argumentaire de broker en PDF,
// note de conseil en PPTX) et ses consignes, la plateforme le confronte aux
// donnees Barzel de la ville du dashboard (aucun selecteur de ville ici).
//
// Deux etats, comme la page Analyste : depot du dossier (aucune conversation
// active) puis fil de discussion. La classe est choisie ICI, « toutes classes »
// incluse (dossier mixte) : le selecteur du Header, limite aux cinq classes
// canoniques, est masque pour ne pas doubler ce controle.
//
// Le texte extrait vit dans la conversation (store persiste) : reprendre une
// contre-analyse dans l'historique retrouve son dossier, et chaque relance
// renvoie le document plus l'historique metier (le backend est sans etat).

const ALL = "all"; // valeur canonique attendue par le backend pour « toutes classes »

const now = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

// Mise en avant des nombres (or), purement presentationnel : meme rendu que le
// chat lateral.
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

// Historique metier envoye au backend : une bulle d'erreur n'est pas un tour de
// conversation, et deux tours consecutifs de meme role (relance apres un echec)
// se fondent en un seul, l'API attendant une alternance.
function businessTurns(msgs: ChatMsg[]): { role: string; text: string }[] {
  const out: { role: string; text: string }[] = [];
  for (const m of msgs) {
    if (m.role === "error") continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.text = `${last.text}\n\n${m.text}`;
    else out.push({ role: m.role, text: m.text });
  }
  return out;
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export default function ContreAnalysePage() {
  const t = useT();
  const lang = useLang();
  const city = cityBySlug(useCityStore((s) => s.slug));

  const [activeId, setActiveId] = useState<string | null>(null);
  const [cls, setCls] = useState<string>("residential");
  const [pending, setPending] = useState<{ text: string; names: string[] } | null>(null);
  const [brief, setBrief] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const conversations = useChatStore((s) => s.conversations);
  const createConv = useChatStore((s) => s.create);
  const appendMsg = useChatStore((s) => s.append);
  const renameConv = useChatStore((s) => s.rename);
  const setDoc = useChatStore((s) => s.setDoc);
  const hydrateChats = useChatStore((s) => s.hydrate);
  const hydratePanel = useHistoryPanelStore((s) => s.hydrate);
  useEffect(() => {
    hydrateChats();
    hydratePanel();
  }, [hydrateChats, hydratePanel]);

  const conv = activeId ? conversations.find((c) => c.id === activeId) : undefined;
  const messages: ChatMsg[] = conv?.messages ?? [];
  const docNames = conv?.docNames ?? pending?.names ?? [];
  const convCls = conv?.cls ?? cls; // la relance garde la classe de l'analyse initiale
  const classOptions = [...assetClassesFor(lang), { value: ALL, label: t("ca.allClasses") }];
  const clsLabel = convCls === ALL ? t("ca.allClasses") : classLabelFor(convCls, lang);

  const scrollDown = () => setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 60);

  const reset = () => {
    setActiveId(null);
    setPending(null);
    setBrief("");
    setInput("");
  };

  // Premiere analyse : le document et les consignes ouvrent la conversation.
  const analyze = async () => {
    const q = brief.trim();
    if (!pending || !q || busy) return;
    const id = createConv("second-opinion", city.slug, cls, lang);
    setDoc(id, pending.text, pending.names);
    renameConv(id, cut(pending.names.length > 1 ? `${pending.names[0]} +${pending.names.length - 1}` : pending.names[0], 60));
    setActiveId(id);
    setBrief("");
    setPending(null);
    setBusy(true);
    appendMsg(id, { role: "user", text: q, at: now() });
    scrollDown();
    try {
      const r = await api.secondOpinionAnalyze(city.slug, pending.text, [{ role: "user", text: q }], cls, lang);
      appendMsg(id, { role: "assistant", text: r.answer, at: now() });
    } catch {
      appendMsg(id, { role: "error", text: t("ai.error"), at: now() });
    } finally {
      setBusy(false);
      scrollDown();
    }
  };

  // Relance : le dossier de la conversation plus tout l'historique metier.
  const ask = async (question: string) => {
    const q = question.trim();
    const doc = conv?.docText ?? "";
    if (!q || !activeId || !doc || busy) return;
    const turns = businessTurns([...messages, { role: "user", text: q, at: now() }]);
    setInput("");
    setBusy(true);
    appendMsg(activeId, { role: "user", text: q, at: now() });
    scrollDown();
    try {
      const r = await api.secondOpinionAnalyze(city.slug, doc, turns, convCls, lang);
      appendMsg(activeId, { role: "assistant", text: r.answer, at: now() });
    } catch {
      appendMsg(activeId, { role: "error", text: t("ai.error"), at: now() });
    } finally {
      setBusy(false);
      scrollDown();
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <HistoryPanel
        kind="second-opinion"
        activeId={activeId}
        onSelect={setActiveId}
        onNew={reset}
        newLabel={t("ca.newAnalysis")}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          marketLine={t(city.texts.marketLines.iaAnalyste)}
          freguesias={[]}
          selected={[]}
          onSelected={() => {
            /* page transverse : aucune maille a filtrer */
          }}
          mode="promotion"
          onMode={() => {
            /* page transverse */
          }}
          assetClass={cls}
          onClass={setCls}
          hideMode
          hideSearch
          hideClass
        />

        {!activeId ? (
          /* ---- Depot du dossier : zone de depot, classe (« toutes classes »
                 comprise), consignes de l'investisseur. */
          <main className="min-h-0 flex-1 overflow-y-auto p-6">
            <div className="mx-auto w-full max-w-[720px]">
              <div className="rounded-2xl border border-navy/10 bg-white p-8 shadow-card">
                <div className="text-label font-semibold uppercase tracking-widest text-gold-700">{t("ca.title")}</div>
                <h2 className="mt-2 font-display text-[24px] leading-tight text-navy">{t("ca.submitTitle")}</h2>
                <p className="mt-2 text-body text-ink-soft">{t("ca.submitSub")}</p>

                <div className="mt-6">
                  <DocDropzone
                    onExtracted={(text, names) => setPending({ text, names })}
                    disabled={busy}
                  />
                </div>

                {/* Le texte extrait est un seul bloc pour tout le depot : on retire
                    le dossier entier (redeposer pour changer de jeu de fichiers),
                    jamais un fichier isole, qui resterait dans le texte analyse. */}
                {pending && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-label font-semibold uppercase tracking-widest text-muted">{t("ca.dossier")}</span>
                    {pending.names.map((n) => (
                      <span
                        key={n}
                        className="rounded-full border border-gold/40 bg-gold/[0.06] px-3 py-1 text-caption text-ink"
                      >
                        {n}
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPending(null)}
                      className="rounded-full px-2 py-1 text-caption text-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
                    >
                      {t("ca.removeDoc")}
                    </button>
                  </div>
                )}

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <span className="text-label font-semibold uppercase tracking-widest text-muted">{t("ca.classLabel")}</span>
                  <Segmented options={classOptions} value={cls} onChange={setCls} />
                </div>

                <div className="mt-6">
                  <label htmlFor="ca-brief" className="text-label font-semibold uppercase tracking-widest text-muted">
                    {t("ca.consignesLabel")}
                  </label>
                  <textarea
                    id="ca-brief"
                    rows={4}
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    placeholder={t("ca.consignesPlaceholder")}
                    className="mt-2 w-full resize-y rounded-xl border border-navy/15 bg-white px-4 py-3 text-body text-ink outline-none transition-shadow placeholder:text-muted focus:border-gold/60 focus:ring-2 focus:ring-gold/40"
                  />
                </div>

                <button
                  type="button"
                  onClick={analyze}
                  disabled={!pending || !brief.trim() || busy}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-navy py-3 text-btn font-medium text-gold transition-colors hover:bg-navy-800 disabled:opacity-40"
                >
                  {busy ? t("ca.analyzing") : t("ca.analyze")}
                </button>
              </div>
            </div>
          </main>
        ) : (
          /* ---- Fil : consignes et relances a droite, contre-analyses au filet
                 or, saisie flottante en bas de la colonne de lecture. */
          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col px-6">
              <div className="flex flex-wrap items-center gap-2 pt-6">
                <span className="text-label font-semibold uppercase tracking-widest text-muted">{t("ca.dossier")}</span>
                {docNames.map((n) => (
                  <span key={n} className="rounded-full border border-gold/40 bg-gold/[0.06] px-3 py-1 text-caption text-ink">
                    {n}
                  </span>
                ))}
                <span className="rounded-full bg-navy/5 px-3 py-1 text-caption text-ink-soft">{clsLabel}</span>
              </div>

              <div className="flex flex-1 flex-col gap-7 pb-6 pt-6">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="self-end text-right">
                      <div className="inline-block max-w-[85%] whitespace-pre-line rounded-2xl border border-navy/10 bg-white px-5 py-2.5 text-left text-body text-ink shadow-sm">
                        {m.text}
                      </div>
                      <div className="mt-1 pr-2 text-label text-muted">{m.at}</div>
                    </div>
                  ) : m.role === "assistant" ? (
                    <div key={i} className="self-start border-l-2 border-gold pl-5 pr-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-label font-semibold uppercase tracking-widest text-gold-700">
                          {t("ai.analyst_label")}
                        </span>
                        <span className="text-label text-muted">· {m.at}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-insight text-ink">{renderAnswer(m.text)}</p>
                    </div>
                  ) : (
                    <div
                      key={i}
                      className="self-start rounded-xl border border-navy/10 bg-cream-200 px-4 py-2 text-caption italic text-ink-soft"
                    >
                      {m.text}
                    </div>
                  ),
                )}
                {busy && (
                  <div className="self-start border-l-2 border-gold/50 pl-5">
                    <span className="text-label font-semibold uppercase tracking-widest text-gold-700/80">
                      {t("ai.analyst_label")}
                    </span>
                    <div className="mt-2.5 flex items-center gap-2">
                      <span className="flex gap-1.5">
                        <Dot delay="0s" /> <Dot delay="0.15s" /> <Dot delay="0.3s" />
                      </span>
                      <span className="text-label text-muted">{t("ai.typing")}</span>
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              <form
                className="sticky bottom-0 shrink-0 pb-5 pt-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(input);
                }}
              >
                <div className="flex items-center gap-2 rounded-full border border-navy/10 bg-white py-1.5 pl-5 pr-1.5 shadow-[0_8px_30px_rgba(10,22,40,0.18)] transition-shadow focus-within:border-gold/60 focus-within:ring-2 focus-within:ring-gold/40">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={t("ca.followupPlaceholder")}
                    className="min-w-0 flex-1 bg-transparent py-2 text-body text-ink outline-none placeholder:text-muted"
                  />
                  <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    aria-label={t("ai.send")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy text-gold transition-colors hover:bg-navy-800 disabled:opacity-40"
                  >
                    <IconArrow />
                  </button>
                </div>
              </form>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold"
      style={{ animationDelay: delay, animationDuration: "0.9s" }}
    />
  );
}

function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M12 19V5M12 5l-6 6M12 5l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
