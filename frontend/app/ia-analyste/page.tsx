"use client";

import { useRef, useState } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { api } from "@/lib/api";
import { useGaia } from "@/lib/useGaia";
import { classLabel } from "@/lib/scoring";

const MARKET_LINE =
  "Posez vos questions sur Gaia : l'analyste répond à partir des scores, verdicts et cascades de la plateforme.";

const SUGGESTIONS = [
  "Où lancer une promotion résidentielle à Gaia ?",
  "Faut-il conserver ou céder un actif résidentiel à Madalena ?",
  "Quel est le meilleur usage d'un terrain à Canidelo ?",
  "Quel impact la réglementation énergétique a-t-elle sur une détention à Santa Marinha ?",
  "Compare Santa Marinha et Madalena en bureaux.",
];

interface Msg {
  role: "user" | "assistant" | "error";
  text: string;
}

export default function IaAnalystePage() {
  const g = useGaia();
  const [selected, setSelected] = useState<string[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const cls = g.assetClass;

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: q }]);
    try {
      const r = await api.analystAsk(q, cls);
      setMessages((m) => [...m, { role: "assistant", text: r.answer }]);
    } catch {
      setMessages((m) => [...m, { role: "error", text: "L'analyste est momentanément indisponible." }]);
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

        <main className="flex min-h-0 flex-1 flex-col gap-4 p-6">
          {/* Module header */}
          <div className="shrink-0">
            <div className="flex items-center gap-3">
              <span className="inline-block h-5 w-1.5 rounded-full bg-gold" />
              <h2 className="font-display text-[22px] leading-none text-navy">IA Analyste</h2>
              <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[11px] font-medium text-gold-600">
                ✦ · {classLabel(cls)}
              </span>
            </div>
            <p className="mt-2 max-w-3xl pl-[18px] text-[13px] leading-relaxed text-muted">
              Un analyste qui lit la plateforme : quatre modes, quinze freguesias, la fiscalité et
              l'énergie — et rien d'autre. La classe sélectionnée cadre ses réponses.
            </p>
          </div>

          {/* Suggested questions */}
          <div className="flex shrink-0 flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                disabled={busy}
                className="rounded-full border border-gold/40 bg-gold/[0.07] px-3 py-1.5 text-[12px] text-gold-600 transition-colors hover:bg-gold/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Conversation */}
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-card">
            <div className="flex-1 overflow-y-auto p-5">
              {messages.length === 0 && (
                <div className="flex h-full items-center justify-center text-center">
                  <div>
                    <div className="font-display text-[28px] text-gold">✦</div>
                    <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
                      Choisissez une question suggérée ou posez la vôtre — l'analyste répond avec
                      les chiffres exacts de la plateforme.
                    </p>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-4">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="self-end rounded-2xl rounded-br-md bg-navy px-4 py-2.5 text-[13px] leading-relaxed text-cream shadow-card xl:max-w-[70%]">
                      {m.text}
                    </div>
                  ) : m.role === "assistant" ? (
                    <div key={i} className="self-start border-l-2 border-gold pl-4 pr-2 xl:max-w-[85%]">
                      <div className="text-[10px] font-semibold uppercase tracking-widest text-gold-600">Analyste Barzel</div>
                      <p className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed text-ink">{m.text}</p>
                    </div>
                  ) : (
                    <div key={i} className="self-start rounded-xl border border-navy/10 bg-cream-200 px-4 py-2 text-[12.5px] italic text-muted">
                      {m.text}
                    </div>
                  )
                )}
                {busy && (
                  <div className="self-start border-l-2 border-gold/40 pl-4">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-gold-600/70">Analyste Barzel</div>
                    <div className="mt-2 flex gap-1.5">
                      <Dot delay="0s" /> <Dot delay="0.15s" /> <Dot delay="0.3s" />
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            </div>

            {/* Input */}
            <form
              className="flex shrink-0 items-center gap-3 border-t border-navy/10 bg-cream-200/50 px-4 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Votre question sur Gaia (${classLabel(cls).toLowerCase()})…`}
                className="flex-1 rounded-xl border border-navy/15 bg-white px-4 py-2.5 text-[13px] text-ink outline-none placeholder:text-muted/70 focus:border-gold/60"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="rounded-xl border border-gold/50 bg-gold/15 px-4 py-2.5 text-[13px] font-medium text-gold-600 transition-colors hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Demander
              </button>
            </form>
          </section>
        </main>
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
