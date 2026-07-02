"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { FoncierTable } from "@/components/FoncierTable";
import { MonteClaroSelector } from "@/components/MonteClaroSelector";
import { MarginBars } from "@/components/MarginBars";
import { InsightBanner } from "@/components/InsightBanner";
import { useGaia } from "@/lib/useGaia";
import { classLabel, verdictTone } from "@/lib/scoring";
import { pctSigned } from "@/lib/arbitrage";
import { fcRows, fcSummary, FcRow } from "@/lib/foncier";
import { landbankInsight, anomalyNote } from "@/lib/insights";

const CANIDELO = "canidelo";
const MARKET_LINE =
  "Rive sud du Douro : le foncier bien desservi se raréfie — la réserve se juge à sa valeur résiduelle par usage et à son horizon d'activation.";

// Landbank reads the land itself, not an asset class: the residual value per
// usage answers the class question — one context line for all five classes.
const CONTEXT =
  "Le foncier ne vaut que par ce qu'on peut y construire : valeur résiduelle par usage (marge promoteur normative 15 %), uplift face au foncier de marché, horizon d'activation.";

export default function FoncierPage() {
  const g = useGaia();
  const [selected, setSelected] = useState<string[]>([]);

  const cls = g.assetClass;
  const allRows = useMemo(() => fcRows(g.landbankCity), [g.landbankCity]);
  const rows = useMemo(
    () => (selected.length ? allRows.filter((r) => selected.includes(r.zone)) : allRows),
    [allRows, selected]
  );
  const summary = useMemo(() => fcSummary(allRows), [allRows]);

  // Foncier module: default the selection to the best reserve (top-score
  // Prioritaire, else top-score viable) once the rows arrive.
  const picked = useRef(false);
  useEffect(() => {
    if (picked.current || !allRows.length) return;
    const prio = allRows.filter((r) => verdictTone("landbank", r.verdict) === "good");
    const pool = prio.length
      ? prio
      : allRows.filter((r) => verdictTone("landbank", r.verdict) !== "low");
    const hero = (pool.length ? pool : allRows).reduce((a, b) => (b.total > a.total ? b : a));
    g.setFocusZone(hero.zone);
    picked.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows]);

  const scopeLabel = summary.scope === "viables" ? "freguesias viables" : "toutes freguesias";

  // Conclusion layer: page insight + banner right block + anomaly note.
  const fcLine = useMemo(() => landbankInsight(allRows), [allRows]);
  // Banner right block: the best potential = the max uplift AMONG the
  // Prioritaires (the sentence leads with it), falling back to the max uplift
  // among viables when no Prioritaire exists.
  const bestPotential: FcRow | null = useMemo(() => {
    const prio = allRows.filter((r) => verdictTone("landbank", r.verdict) === "good");
    const pool = prio.length ? prio : allRows.filter((r) => verdictTone("landbank", r.verdict) !== "low");
    if (!pool.length) return null;
    return pool.reduce((a, b) => (b.upliftPct > a.upliftPct ? b : a));
  }, [allRows]);
  const fregScores = useMemo(
    () => (g.landbankCity?.zones ?? []).filter((z) => z.level === "freguesia"),
    [g.landbankCity]
  );
  const note = useMemo(() => anomalyNote("landbank", fregScores), [fregScores]);

  // K-REST featured asset (Monte Claro) — fed by Canidelo's real per-usage
  // residual table and score.
  const assetProps = useMemo(() => {
    const row = allRows.find((r) => r.zone === CANIDELO);
    const score = fregScores.find((z) => z.zone === CANIDELO);
    if (!row || !score) return null;
    const weight = score.pillars.find((p) => p.pillar === "valeur_meilleur_usage")?.weight ?? 0.25;
    return { row, baseTotal: score.total, weight };
  }, [allRows, fregScores]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          marketLine={MARKET_LINE}
          freguesias={g.freguesias}
          selected={selected}
          onSelected={setSelected}
          mode="landbank"
          onMode={() => { /* module épinglé sur le landbank */ }}
          assetClass={g.assetClass}
          onClass={g.setAssetClass}
          hideMode
        />

        {g.error && (
          <div className="mx-6 mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-[13px] text-red-700">
            Backend injoignable — lancez l'API (uvicorn backend.main:app). {g.error}
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
          {/* Module header */}
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-block h-5 w-1.5 rounded-full bg-gold" />
              <h2 className="font-display text-[22px] leading-none text-navy">Foncier</h2>
              <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[11px] font-medium text-gold-600">
                Landbank · {classLabel(cls)}
              </span>
            </div>
            <p className="mt-2 max-w-3xl pl-[18px] text-[13px] leading-relaxed text-muted">{CONTEXT}</p>
          </div>

          {/* Conclusion banner (shared InsightBanner) */}
          <InsightBanner
            eyebrow={`Verdict landbank · ${classLabel(cls)}`}
            sentence={fcLine}
            right={
              bestPotential ? (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-cream/50">Meilleur potentiel · {bestPotential.short}</div>
                  <div className="font-display text-[40px] leading-none text-gold">{pctSigned(bestPotential.upliftPct, 0)}</div>
                </div>
              ) : undefined
            }
          />

          {/* 4 key figures — medians on viable freguesias (Prioritaire/À phaser) */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi
              label="Uplift médian"
              value={summary.medianUplift != null ? pctSigned(summary.medianUplift, 0) : "—"}
              sub={scopeLabel}
            />
            <Kpi
              label="Constructibilité médiane"
              value={summary.medianConstructibilite != null ? `${Math.round(summary.medianConstructibilite)}` : "—"}
              sub={scopeLabel}
            />
            <Kpi
              label="Meilleur usage dominant"
              value={summary.usageDominant ? summary.usageDominant.charAt(0).toUpperCase() + summary.usageDominant.slice(1) : "—"}
              sub={scopeLabel}
            />
            <Kpi
              label="Prioritaires"
              value={summary.totalCount ? `${summary.prioCount} / ${summary.totalCount}` : "—"}
              sub="verdict Prioritaire"
            />
          </div>

          {/* Table — core of the page */}
          <FoncierTable
            rows={rows}
            mode="landbank"
            focusZone={g.focusZone}
            onSelect={g.setFocusZone}
          />

          {/* Analysis note — the most telling exception (if any) */}
          {note && (
            <div className="-mt-2 shrink-0 pl-1 text-[12px] leading-snug text-muted">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gold-600">Note d'analyse</span>
              <span className="mx-2 text-navy/20">·</span>
              {note}
            </div>
          )}

          {/* Uplift by freguesia chart + Monte Claro usage selector */}
          <div className={`shrink-0 ${assetProps ? "grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr]" : ""}`}>
            <MarginBars
              rows={allRows}
              mode="landbank"
              focusZone={g.focusZone}
              onSelect={g.setFocusZone}
              classLabel={classLabel(cls)}
              metric={(r) => r.upliftPct}
              title="Uplift % par freguesia"
              metricLabel="uplift"
              digits={1}
            />
            {assetProps && (
              <div className="flex flex-col gap-2">
                <MonteClaroSelector {...assetProps} />
                <p className="px-1 text-[11px] leading-snug text-muted">
                  Sélecteur temps réel sur l'actif K-REST à Canidelo : changez l'usage du terrain
                  pour voir la valeur résiduelle, l'uplift et le verdict se recalculer.
                </p>
              </div>
            )}
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
      <div className="text-[11px] font-medium uppercase tracking-widest text-muted">{label}</div>
      <div className="mt-1 font-display text-[26px] leading-none text-navy">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
