"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { InsightBanner } from "@/components/InsightBanner";
import { RetrofitSimulator } from "@/components/RetrofitSimulator";
import { useGaia } from "@/lib/useGaia";
import { classLabel, pillarValue } from "@/lib/scoring";
import { rdRows } from "@/lib/rendement";
import { energieInsight, energyVerdict, parcFor, riskMeps } from "@/lib/energie";

const SANTA = "santamarinhaesaopedrodaafurada";
const MARKET_LINE =
  "Rive sud du Douro : ce que la réglementation énergétique va coûter au parc, où — et comment c'est déjà compté dans nos verdicts.";

// Verified regulatory milestones (EPBD (UE) 2024/1275 ; SCE DL 101-D/2020).
const TIMELINE: { when: string; what: string }[] = [
  { when: "28 mai 2024", what: "Directive EPBD (UE) 2024/1275 en vigueur (refonte)." },
  { when: "29 mai 2026", what: "Transposition nationale ; Portugal : révision du SCE (DL 101-D/2020, classes A+ → F)." },
  { when: "2028", what: "Neuf public zéro émission ; carbone du cycle de vie calculé au-delà de 1 000 m²." },
  { when: "2030", what: "Non-résidentiel : les 16% les moins performants rénovés ; tout le neuf zéro émission ; résidentiel : énergie primaire moyenne −16%." },
  { when: "2033", what: "Non-résidentiel : seuil porté aux 26% les moins performants." },
  { when: "2035", what: "Résidentiel : −20 à 22%, dont ≥ 55% de l'effort sur les 43% les plus énergivores." },
  { when: "2040", what: "Sortie des chaudières à combustibles fossiles." },
];

const toneColor = { good: "#2F6B3D", mid: "#C9A86A", low: "#9E5B5B" } as const;

export default function EnergiePage() {
  const g = useGaia();
  const [selected, setSelected] = useState<string[]>([]);
  const cls = g.assetClass;

  const detRows = useMemo(() => rdRows(g.detentionCity), [g.detentionCity]);
  const santaRow = useMemo(() => detRows.find((r) => r.zone === SANTA) ?? null, [detRows]);

  // Table: simulated SCE stock joined with the engine's energy pillar risk.
  const rows = useMemo(() => {
    const fregs = (g.detentionCity?.zones ?? []).filter((z) => z.level === "freguesia");
    const engineRisk = fregs.length ? pillarValue(fregs[0].pillars, "risque_energie") ?? 35 : 35;
    const parcs = fregs
      .map((z) => ({ z, parc: parcFor(z.zone, cls) }))
      .filter((e): e is { z: (typeof fregs)[number]; parc: NonNullable<ReturnType<typeof parcFor>> } => !!e.parc);
    const efMax = Math.max(...parcs.map((e) => e.parc.ef), 1);
    return parcs
      .map(({ z, parc }) => {
        const risk = riskMeps(engineRisk, parc.ef, efMax);
        return {
          zone: z.zone,
          name: z.zone_name.replace(/^União das freguesias de /i, ""),
          parc,
          risk,
          verdict: energyVerdict(risk),
        };
      })
      .sort((a, b) => b.parc.ef - a.parc.ef);
  }, [g.detentionCity, cls]);

  const sentence = useMemo(
    () => energieInsight(cls, rows.map((r) => r.zone)),
    [cls, rows]
  );
  const maxRow = rows[0];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          marketLine={MARKET_LINE}
          freguesias={g.freguesias}
          selected={selected}
          onSelected={setSelected}
          mode="detention"
          onMode={() => { /* page transverse */ }}
          assetClass={g.assetClass}
          onClass={g.setAssetClass}
          hideMode
        />

        <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
          {/* Module header */}
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-block h-5 w-1.5 rounded-full bg-gold" />
              <h2 className="font-display text-[22px] leading-none text-navy">Énergie</h2>
              <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[11px] font-medium text-gold-600">
                EPBD · {classLabel(cls)}
              </span>
            </div>
            <p className="mt-2 max-w-3xl pl-[18px] text-[13px] leading-relaxed text-muted">
              La directive EPBD impose une trajectoire de rénovation au parc européen ; le
              certificat SCE (A+ → F) en est l'instrument portugais. Exposition du parc de Gaia,
              échéances, et coût d'une mise à niveau.
            </p>
          </div>

          {/* Exposure of the stock */}
          <InsightBanner
            eyebrow={`Exposition du parc · ${classLabel(cls)}`}
            sentence={sentence}
            right={
              maxRow ? (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-cream/50">Parc le plus exposé · {maxRow.name.split(/ e |,/)[0]}</div>
                  <div className="font-display text-[40px] leading-none text-gold">{maxRow.parc.ef}%</div>
                  <div className="text-[10px] text-cream/50">du parc en classes E-F</div>
                </div>
              ) : undefined
            }
          />

          {/* Timeline + simulator */}
          <div className="grid shrink-0 grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr]">
            <section className="rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
              <h3 className="font-display text-[16px] leading-tight text-navy">Trajectoire réglementaire</h3>
              <p className="mt-0.5 text-[11px] text-muted">EPBD (UE) 2024/1275 — échéances applicables au parc existant et au neuf.</p>
              <div className="mt-3 flex flex-col">
                {TIMELINE.map((t) => (
                  <div key={t.when} className="flex gap-3 border-l-2 border-gold/30 pb-3 pl-4 last:pb-0">
                    <div className="relative -ml-[21px] mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-gold bg-white" />
                    <div>
                      <span className="text-[12px] font-semibold text-navy">{t.when}</span>
                      <span className="mx-2 text-navy/20">·</span>
                      <span className="text-[12.5px] leading-snug text-ink/80">{t.what}</span>
                    </div>
                  </div>
                ))}
              </div>
              <Link
                href="/rendement"
                className="mt-4 block rounded-xl border border-gold/30 bg-gold/[0.07] px-3 py-2 text-[11.5px] leading-snug text-gold-600 transition-colors hover:bg-gold/15"
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide">Dans la plateforme</span>
                <br />
                pilier énergie de la cascade Rendement →
              </Link>
            </section>

            <div className="flex flex-col gap-2">
              {santaRow ? (
                <RetrofitSimulator row={santaRow} />
              ) : (
                <div className="flex min-h-[280px] items-center justify-center rounded-2xl bg-navy text-[13px] text-cream/60 shadow-card">
                  Chargement…
                </div>
              )}
              <p className="px-1 text-[11px] leading-snug text-muted">
                Simulateur temps réel : choisissez la classe actuelle et la cible pour voir le
                CAPEX estimé et la compression du yield net se recalculer.
              </p>
            </div>
          </div>

          {/* Stock by freguesia */}
          <div className="shrink-0 overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead className="bg-cream-200">
                  <tr className="border-b border-navy/10 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                    <th className="px-3 py-2.5 text-left">Freguesia</th>
                    <th className="px-3 py-2.5 text-right">Classes A+-B</th>
                    <th className="px-3 py-2.5 text-right">Classes C-D</th>
                    <th className="px-3 py-2.5 text-right">Classes E-F</th>
                    <th className="px-3 py-2.5 text-right">Risque MEPS /100</th>
                    <th className="px-3 py-2.5 text-left">Verdict énergie</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.zone} className="border-b border-navy/[0.06]">
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-ink">{r.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink/80">{r.parc.ab}%</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink/80">{r.parc.cd}%</td>
                      <td className="px-3 py-2 text-right">
                        <span className="font-display text-[15px] font-medium tabular-nums" style={{ color: toneColor[r.verdict.tone] }}>
                          {r.parc.ef}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink/80">{r.risk}</td>
                      <td className="px-3 py-2">
                        <span
                          className="rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white"
                          style={{ background: toneColor[r.verdict.tone] }}
                        >
                          {r.verdict.label}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-[13px] text-muted">
                        Chargement des freguesias…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Discreet source line */}
          <p className="shrink-0 pl-1 text-[11px] text-muted/80">
            Directive EPBD (UE) 2024/1275 · SCE — DL 101-D/2020 (classes A+ → F) · coûts de
            rénovation : ordres de grandeur ADENE / marché 2026. Répartition du parc par freguesia :
            estimation Barzel.
          </p>
        </main>
      </div>
    </div>
  );
}
