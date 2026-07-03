"use client";

import { useRef, useState } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { api } from "@/lib/api";
import { useGaia } from "@/lib/useGaia";
import { classLabel } from "@/lib/scoring";

const MARKET_LINE =
  "Posez vos questions sur Gaia : l'analyste répond à partir des scores, verdicts et cascades de la plateforme.";

// Icône fine (trait 1.5) par question suggérée.
const SUGGESTIONS: { q: string; icon: React.ReactNode }[] = [
  { q: "Où lancer une promotion résidentielle à Gaia ?", icon: <IconPin /> },
  { q: "Faut-il conserver ou céder un actif résidentiel à Madalena ?", icon: <IconBuilding /> },
  { q: "Quel est le meilleur usage d'un terrain à Canidelo ?", icon: <IconLayers /> },
  { q: "Quel impact la réglementation énergétique a-t-elle sur une détention à Santa Marinha ?", icon: <IconBolt /> },
  { q: "Compare Santa Marinha et Madalena en bureaux.", icon: <IconCompare /> },
];

interface Msg {
  role: "user" | "assistant" | "error";
  text: string;
  at: string; // horodatage HH:MM
}

// Mise en évidence des chiffres (or lisible) et des verdicts (badge discret)
// dans la prose de l'analyste — purement présentationnel.
const VERDICT_WORDS =
  /(Fenêtre ouverte|Fenêtre étroite|Fenêtre fermée|Fenetre ouverte|Fenetre etroite|Fenetre fermee|À phaser|A phaser|En attente|Prioritaire|Conserver|Surveiller|Céder|Ceder|Conditionnel|Passer|Go)(?![\wà-ÿ])/g;

function renderAnswer(text: string) {
  const numSplit = text.split(/(\d[\d.,  ]*\s?(?:%|€\/m²(?:\/an)?|€|\/100|pts?|mois)?)/g);
  return numSplit.map((part, i) => {
    if (/^\d/.test(part)) {
      return (
        <span key={i} className="font-semibold text-gold-700">
          {part}
        </span>
      );
    }
    const chunks = part.split(VERDICT_WORDS);
    return (
      <span key={i}>
        {chunks.map((c, j) =>
          j % 2 === 1 ? (
            <span
              key={j}
              className="mx-0.5 inline-block rounded-md border border-navy/15 bg-navy/[0.04] px-1.5 py-px align-baseline text-btn font-medium leading-snug text-navy"
            >
              {c}
            </span>
          ) : (
            <span key={j}>{c}</span>
          )
        )}
      </span>
    );
  });
}

const now = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export default function IaAnalystePage() {
  const g = useGaia();
  const [selected, setSelected] = useState<string[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const cls = g.assetClass;
  const empty = messages.length === 0 && !busy;

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: q, at: now() }]);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 60);
    try {
      const r = await api.analystAsk(q, cls);
      setMessages((m) => [...m, { role: "assistant", text: r.answer, at: now() }]);
    } catch {
      setMessages((m) => [...m, { role: "error", text: "L'analyste est momentanément indisponible.", at: now() }]);
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 60);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          marketLine={MARKET_LINE}
          freguesias={g.freguesias}
          selected={selected}
          onSelected={setSelected}
          mode="promotion"
          onMode={() => { /* page transverse */ }}
          assetClass={g.assetClass}
          onClass={g.setAssetClass}
          hideMode
          hideSearch
        />

        {empty ? (
          /* ---- État vide : toile navy centrée, accroche Playfair cream, une
                 saisie en pilule, cinq suggestions en cartes — rien d'autre. */
          <main className="min-h-0 flex-1 overflow-y-auto p-6">
            <section className="flex min-h-full flex-col items-center justify-center rounded-2xl bg-navy px-6 py-14 shadow-card">
              <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
                <div className="font-display text-[26px] leading-none text-gold">✦</div>
                <div className="mt-3 text-label font-semibold uppercase tracking-widest text-gold/90">
                  IA Analyste · Barzel
                </div>
                <h2 className="mt-4 font-display text-[40px] leading-tight text-cream">
                  Que voulez-vous savoir sur Gaia ?
                </h2>
                <p className="mt-3 text-body text-cream/70">
                  Réponses en {classLabel(cls).toLowerCase()} — scores, verdicts, fiscalité et énergie de la plateforme.
                </p>

                <form
                  className="mt-9 w-full max-w-2xl"
                  onSubmit={(e) => {
                    e.preventDefault();
                    ask(input);
                  }}
                >
                  <div className="flex items-center gap-2 rounded-full bg-white py-2 pl-6 pr-2 shadow-[0_10px_40px_rgba(0,0,0,0.35)] ring-1 ring-white/10 transition-shadow focus-within:ring-2 focus-within:ring-gold">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Votre question sur Gaia…"
                      className="min-w-0 flex-1 bg-transparent py-2 text-body text-ink outline-none placeholder:text-muted"
                    />
                    <button
                      type="submit"
                      disabled={!input.trim()}
                      aria-label="Demander"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold text-navy transition-colors hover:bg-gold-600 disabled:opacity-40"
                    >
                      <IconArrow />
                    </button>
                  </div>
                </form>

                <div className="mt-10 grid w-full gap-3 text-left sm:grid-cols-2 xl:grid-cols-3">
                  {SUGGESTIONS.map(({ q, icon }) => (
                    <button
                      key={q}
                      onClick={() => ask(q)}
                      className="group flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-left transition-colors hover:border-gold/50 hover:bg-gold/10"
                    >
                      <span className="mt-0.5 shrink-0 text-gold/80 transition-colors group-hover:text-gold">{icon}</span>
                      <span className="text-body leading-snug text-cream/85 transition-colors group-hover:text-cream">{q}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </main>
        ) : (
          /* ---- État conversation : colonne de lecture 720px, questions en
                 pilule claire à droite, réponses au filet or, saisie flottante. */
          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col px-6">
              <div className="flex flex-1 flex-col gap-7 pb-6 pt-8">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="self-end text-right">
                      <div className="inline-block max-w-[85%] rounded-full border border-navy/10 bg-white px-5 py-2.5 text-left text-body text-ink shadow-sm">
                        {m.text}
                      </div>
                      <div className="mt-1 pr-2 text-label text-muted">{m.at}</div>
                    </div>
                  ) : m.role === "assistant" ? (
                    <div key={i} className="self-start border-l-2 border-gold pl-5 pr-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-label font-semibold uppercase tracking-widest text-gold-700">
                          Analyste Barzel
                        </span>
                        <span className="text-label text-muted">· {m.at}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-insight text-ink">{renderAnswer(m.text)}</p>
                    </div>
                  ) : (
                    <div key={i} className="self-start rounded-xl border border-navy/10 bg-cream-200 px-4 py-2 text-caption italic text-ink-soft">
                      {m.text}
                    </div>
                  )
                )}
                {busy && (
                  <div className="self-start border-l-2 border-gold/50 pl-5">
                    <span className="text-label font-semibold uppercase tracking-widest text-gold-700/80">
                      Analyste Barzel
                    </span>
                    <div className="mt-2.5 flex items-center gap-2">
                      <span className="flex gap-1.5">
                        <Dot delay="0s" /> <Dot delay="0.15s" /> <Dot delay="0.3s" />
                      </span>
                      <span className="text-label text-muted">rédige…</span>
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {/* Saisie flottante ancrée en bas de la colonne */}
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
                    placeholder={`Votre question sur Gaia (${classLabel(cls).toLowerCase()})…`}
                    className="min-w-0 flex-1 bg-transparent py-2 text-body text-ink outline-none placeholder:text-muted"
                  />
                  <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    aria-label="Demander"
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

/* ---- Icônes fines (trait 1.5, currentColor) ---- */
function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M12 19V5M12 5l-6 6M12 5l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconPin() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function IconBuilding() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 9h3a1 1 0 0 1 1 1v11M3 21h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8.5 8h1M11.5 8h1M8.5 11.5h1M11.5 11.5h1M8.5 15h1M11.5 15h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconLayers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="m12 3 9 5-9 5-9-5 9-5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m4.5 12.5 7.5 4.2 7.5-4.2M4.5 16.5 12 20.7l7.5-4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconBolt() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
function IconCompare() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M8 7h11M8 7l3-3M8 7l3 3M16 17H5m11 0-3-3m3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
