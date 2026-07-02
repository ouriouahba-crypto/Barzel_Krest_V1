"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { RendementTable } from "@/components/RendementTable";
import { YieldWaterfall } from "@/components/YieldWaterfall";
import { MarginBars } from "@/components/MarginBars";
import { InsightBanner } from "@/components/InsightBanner";
import { useGaia } from "@/lib/useGaia";
import { classLabel, verdictTone } from "@/lib/scoring";
import { eur0 } from "@/lib/priceMargin";
import { rdRows, rdSummary, RdRow } from "@/lib/rendement";
import { detentionInsight, anomalyNote } from "@/lib/insights";

const MARKET_LINE =
  "Rive sud du Douro : demande locative réelle, loyers en rattrapage — conserver ne se justifie qu'au rendement net, après charges et fiscalité.";

// Détention economics, one line per class.
const CONTEXT: Record<string, string> = {
  residential:
    "Les prix ont couru plus vite que les loyers : le rendement net se joue sur les charges, la vacance et l'IMI — et la pression énergétique (MEPS) pèsera d'abord sur le parc ancien.",
  office:
    "Bureaux : loyers stables mais demande concentrée sur le front de fleuve ; charges plus lourdes, et l'obsolescence énergétique guette les plateaux anciens.",
  hotel:
    "Hôtellerie : le loyer suit la fréquentation touristique ; charges d'exploitation élevées — le net ne récompense que les murs les mieux placés.",
  logistics:
    "Logistique : loyers modestes mais réguliers et charges contenues — le rendement net résiste mieux qu'ailleurs à la vacance.",
  retail:
    "Commerce : loyers prime élevés en pied d'immeuble mais vacance sensible à la conjoncture ; le net dépend de l'emplacement plus que du m².",
};

export default function RendementPage() {
  const g = useGaia();
  const [selected, setSelected] = useState<string[]>([]);

  const cls = g.assetClass;
  const allRows = useMemo(() => rdRows(g.detentionCity), [g.detentionCity]);
  const rows = useMemo(
    () => (selected.length ? allRows.filter((r) => selected.includes(r.zone)) : allRows),
    [allRows, selected]
  );
  const summary = useMemo(() => rdSummary(allRows), [allRows]);
  const selectedRow = useMemo(
    () => allRows.find((r) => r.zone === g.focusZone) ?? null,
    [allRows, g.focusZone]
  );

  // Détention module: default the selection to the best-kept freguesia (top
  // Conserver, else best net yield) once the rows arrive.
  const picked = useRef(false);
  useEffect(() => {
    if (picked.current || !allRows.length) return;
    const hero =
      allRows.find((r) => verdictTone("detention", r.verdict) === "good") ?? allRows[0];
    g.setFocusZone(hero.zone);
    picked.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows]);

  const scopeLabel = summary.scope === "viables" ? "freguesias viables" : "toutes freguesias";

  // Conclusion layer: page insight + banner right block + anomaly note.
  const rdLine = useMemo(() => detentionInsight(allRows, cls), [allRows, cls]);
  const maxRow: RdRow | null = summary.best;
  const fregScores = useMemo(
    () => (g.detentionCity?.zones ?? []).filter((z) => z.level === "freguesia"),
    [g.detentionCity]
  );
  const note = useMemo(() => anomalyNote("detention", fregScores), [fregScores]);

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
          onMode={() => { /* module épinglé sur la détention */ }}
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
              <h2 className="font-display text-[22px] leading-none text-navy">Rendement</h2>
              <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[11px] font-medium text-gold-600">
                Détention · {classLabel(cls)}
              </span>
            </div>
            <p className="mt-2 max-w-3xl pl-[18px] text-[13px] leading-relaxed text-muted">
              {CONTEXT[cls] ?? CONTEXT.residential}
            </p>
          </div>

          {/* Conclusion banner (shared InsightBanner) */}
          <InsightBanner
            eyebrow={`Verdict détention · ${classLabel(cls)}`}
            sentence={rdLine}
            right={
              maxRow ? (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-cream/50">Yield net max · {maxRow.short}</div>
                  <div className="font-display text-[40px] leading-none text-gold">{maxRow.yieldNet.toFixed(1)}%</div>
                </div>
              ) : undefined
            }
          />

          {/* 4 key figures — medians on viable freguesias (Conserver/Surveiller) */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi
              label="Yield net médian"
              value={summary.medianYieldNet != null ? `${summary.medianYieldNet.toFixed(1)}%` : "—"}
              sub={scopeLabel}
            />
            <Kpi
              label="Yield brut médian"
              value={summary.medianYieldBrut != null ? `${summary.medianYieldBrut.toFixed(1)}%` : "—"}
              sub={scopeLabel}
            />
            <Kpi
              label="Loyer de marché médian"
              value={summary.medianLoyer != null ? `${eur0(summary.medianLoyer)} €/m²/an` : "—"}
              sub={scopeLabel}
            />
            <Kpi
              label="À céder"
              value={summary.totalCount ? `${summary.cederCount} / ${summary.totalCount}` : "—"}
              sub="freguesias au verdict Céder"
            />
          </div>

          {/* Table — core of the page */}
          <RendementTable
            rows={rows}
            mode="detention"
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

          {/* Yield decomposition for the selected freguesia */}
          <div className="shrink-0">
            <YieldWaterfall row={selectedRow} mode="detention" classLabel={classLabel(cls)} />
          </div>

          {/* Net yield by freguesia chart */}
          <div className="shrink-0">
            <MarginBars
              rows={allRows}
              mode="detention"
              focusZone={g.focusZone}
              onSelect={g.setFocusZone}
              classLabel={classLabel(cls)}
              metric={(r) => r.yieldNet}
              title="Yield net % par freguesia"
              metricLabel="yield net"
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
      <div className="text-[11px] font-medium uppercase tracking-widest text-muted">{label}</div>
      <div className="mt-1 font-display text-[26px] leading-none text-navy">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
