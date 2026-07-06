"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { ArbitrageTable } from "@/components/ArbitrageTable";
import { SpreadWaterfall } from "@/components/SpreadWaterfall";
import { CaisSlider } from "@/components/CaisSlider";
import { MarginBars } from "@/components/MarginBars";
import { InsightBanner } from "@/components/InsightBanner";
import { cityBySlug } from "@/lib/cities";
import { useCityStore } from "@/lib/cityStore";
import { useGaia } from "@/lib/useGaia";
import { classLabel, verdictTone } from "@/lib/scoring";
import { arbRows, arbSummary, ArbRow, pctSigned } from "@/lib/arbitrage";
import { arbitrageInsight, anomalyNote } from "@/lib/insights";

const SANTA = "santamarinhaesaopedrodaafurada";
// Ligne marché : registre des villes (lib/cities.ts).

// Arbitrage economics, one line per class.
const CONTEXT: Record<string, string> = {
  residential:
    "Le résidentiel a couru : les écarts face à la médiane sont réels, mais l'acheteur institutionnel reste rare. La fenêtre de cession se juge {maille} par {maille}.",
  office:
    "Bureaux : appétit institutionnel soutenu et offre prime rare. Les meilleurs actifs trouvent preneur, le reste attend son cycle.",
  hotel:
    "Hôtellerie : appétit fort porté par la fréquentation, mais peu d'actifs de taille institutionnelle. La fenêtre dépend de l'emplacement.",
  logistics:
    "Logistique : demande investisseurs profonde mais spreads minces face à la médiane. Céder vite, à prix serré.",
  retail:
    "Commerce : acheteurs sélectifs et valeurs dispersées ; la fenêtre ne s'ouvre que sur les emplacements n°1.",
};

export default function ArbitragePage() {
  const g = useGaia();
  const city = cityBySlug(useCityStore((s) => s.slug));
  const [selected, setSelected] = useState<string[]>([]);

  const cls = g.assetClass;
  const allRows = useMemo(() => arbRows(g.arbitrageCity), [g.arbitrageCity]);
  const rows = useMemo(
    () => (selected.length ? allRows.filter((r) => selected.includes(r.zone)) : allRows),
    [allRows, selected]
  );
  const summary = useMemo(() => arbSummary(allRows), [allRows]);
  const selectedRow = useMemo(
    () => allRows.find((r) => r.zone === g.focusZone) ?? null,
    [allRows, g.focusZone]
  );

  // Arbitrage module: default the selection to the best window (top-score
  // Fenêtre ouverte, else top-score viable) once the rows arrive.
  const picked = useRef(false);
  useEffect(() => {
    if (picked.current || !allRows.length) return;
    const open = allRows.filter((r) => verdictTone("arbitrage", r.verdict) === "good");
    const pool = open.length
      ? open
      : allRows.filter((r) => verdictTone("arbitrage", r.verdict) !== "low");
    const hero = (pool.length ? pool : allRows).reduce((a, b) => (b.total > a.total ? b : a));
    g.setFocusZone(hero.zone);
    picked.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows]);

  const zn = { sg: city.zoneNoun, pl: city.zoneNounPlural };
  const scopeLabel = summary.scope === "viables" ? `${zn.pl} viables` : `toutes ${zn.pl}`;

  // Conclusion layer: page insight + banner right block + anomaly note.
  const arbLine = useMemo(() => arbitrageInsight(allRows, cls, zn), [allRows, cls]);
  // Banner right block: the best window (top-score open, else top viable),
  // never a global spread max that would contradict the sentence.
  const bestWindow: ArbRow | null = useMemo(() => {
    const open = allRows.filter((r) => verdictTone("arbitrage", r.verdict) === "good");
    const pool = open.length ? open : allRows.filter((r) => verdictTone("arbitrage", r.verdict) !== "low");
    if (!pool.length) return null;
    return pool.reduce((a, b) => (b.total > a.total ? b : a));
  }, [allRows]);
  const fregScores = useMemo(
    () => (g.arbitrageCity?.zones ?? []).filter((z) => z.level !== "municipio"),
    [g.arbitrageCity]
  );
  const note = useMemo(() => anomalyNote("arbitrage", fregScores), [fregScores]);

  // K-REST featured asset (Cais Poente), shown for Santa Marinha / résidentiel,
  // fed by the freguesia's own médiane, realizable value, rotation and score.
  const assetProps = useMemo(() => {
    const row = allRows.find((r) => r.zone === SANTA);
    const score = fregScores.find((z) => z.zone === SANTA);
    if (!row || !score) return null;
    const weight = score.pillars.find((p) => p.pillar === "spread")?.weight ?? 0.3;
    return { row, baseTotal: score.total, weight };
  }, [allRows, fregScores]);
  const showAsset = g.focusZone === SANTA && cls === "residential" && !!assetProps;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          marketLine={city.texts.marketLines.arbitrage}
          freguesias={g.freguesias}
          selected={selected}
          onSelected={setSelected}
          mode="arbitrage"
          onMode={() => { /* module épinglé sur l'arbitrage */ }}
          assetClass={g.assetClass}
          onClass={g.setAssetClass}
          hideMode
        />

        {g.error && (
          <div className="mx-6 mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-body text-red-700">
            Backend injoignable : lancez l'API (uvicorn backend.main:app). {g.error}
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
          {/* Module header */}
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-block h-5 w-1.5 rounded-full bg-gold" />
              <h2 className="font-display text-[24px] leading-none text-navy">Arbitrage</h2>
              <span className="rounded-full border border-gold/40 bg-gold/[0.06] px-2.5 py-0.5 text-label font-medium text-gold-700">
                Arbitrage · {classLabel(cls)}
              </span>
            </div>
            <p className="mt-2 max-w-3xl pl-[18px] text-body leading-relaxed text-ink-soft">
              {(CONTEXT[cls] ?? CONTEXT.residential).replaceAll("{maille}", city.zoneNoun)}
            </p>
          </div>

          {/* Conclusion banner (shared InsightBanner) */}
          <InsightBanner
            eyebrow={`Verdict arbitrage · ${classLabel(cls)}`}
            sentence={arbLine}
            right={
              bestWindow ? (
                <div className="text-right">
                  <div className="text-label uppercase tracking-widest text-cream/70">Meilleure fenêtre · {bestWindow.short}</div>
                  <div className="font-display text-kpi-hero leading-none text-gold">{pctSigned(bestWindow.spreadPct, 0)}</div>
                </div>
              ) : undefined
            }
          />

          {/* 4 key figures: medians on viable freguesias (ouverte/étroite) */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi
              label="Spread médian"
              value={summary.medianSpread != null ? pctSigned(summary.medianSpread, 0) : "–"}
              sub={scopeLabel}
            />
            <Kpi
              label="Délai de cession médian"
              value={summary.medianDelai != null ? `${summary.medianDelai.toFixed(1)} mois` : "–"}
              sub={scopeLabel}
            />
            <Kpi
              label="Appétit dominant"
              value={summary.appetit ? summary.appetit.charAt(0).toUpperCase() + summary.appetit.slice(1) : "–"}
              sub="appétit institutionnel"
            />
            <Kpi
              label="Fenêtres ouvertes"
              value={summary.totalCount ? `${summary.openCount} / ${summary.totalCount}` : "–"}
              sub="verdict Fenêtre ouverte"
            />
          </div>

          {/* Table: core of the page */}
          <ArbitrageTable
            rows={rows}
            mode="arbitrage"
            focusZone={g.focusZone}
            onSelect={g.setFocusZone}
          />

          {/* Analysis note: the most telling exception (if any) */}
          {note && (
            <div className="-mt-2 shrink-0 pl-1 text-body leading-snug text-ink-soft">
              <span className="text-label font-semibold uppercase tracking-widest text-gold-700">Note d'analyse</span>
              <span className="mx-2 text-navy/20">·</span>
              {note}
            </div>
          )}

          {/* Disposal decomposition (+ Cais Poente slider for Santa Marinha résidentiel) */}
          <div className={`shrink-0 ${showAsset ? "grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr]" : ""}`}>
            <SpreadWaterfall row={selectedRow} mode="arbitrage" classLabel={classLabel(cls)} />
            {showAsset && assetProps && (
              <div className="flex flex-col gap-2">
                <CaisSlider {...assetProps} />
                <p className="px-1 text-caption leading-snug text-ink-soft">
                  Curseur temps réel sur l'actif K-REST à Santa Marinha : ajustez le prix de
                  cession visé pour voir le spread, le délai et le verdict se recalculer.
                </p>
              </div>
            )}
          </div>

          {/* Spread by freguesia chart */}
          <div className="shrink-0">
            <MarginBars
              rows={allRows}
              mode="arbitrage"
              focusZone={g.focusZone}
              onSelect={g.setFocusZone}
              classLabel={classLabel(cls)}
              metric={(r) => r.spreadPct}
              title={`Spread % par ${zn.sg}`}
              metricLabel="spread"
              digits={1}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-navy/10 bg-white px-4 py-3.5 shadow-card">
      <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-gold/40 via-gold to-gold/40" />
      <div className="text-label font-medium uppercase tracking-widest text-muted">{label}</div>
      <div className="mt-1 font-display text-kpi leading-none text-navy">{value}</div>
      {sub && <div className="mt-1 text-label text-muted">{sub}</div>}
    </div>
  );
}
