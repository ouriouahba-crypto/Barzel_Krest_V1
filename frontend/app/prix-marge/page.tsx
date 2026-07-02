"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { PriceMarginTable } from "@/components/PriceMarginTable";
import { MarginWaterfall } from "@/components/MarginWaterfall";
import { MarginBars } from "@/components/MarginBars";
import { HayaSlider } from "@/components/HayaSlider";
import { useGaia } from "@/lib/useGaia";
import { classLabel } from "@/lib/scoring";
import { pmRows, pmSummary, eurM2 } from "@/lib/priceMargin";

const AFURADA = "santamarinhaesaopedrodaafurada";
const MARKET_LINE =
  "Rive sud du Douro : offre neuve rare côté fleuve, coûts de construction maîtrisés — la marge de promotion se joue freguesia par freguesia.";

// Promotion economics, one line per class.
const CONTEXT: Record<string, string> = {
  residential:
    "Le neuf se vend cher rive sud du Douro quand le foncier reste rare : la marge de promotion se décide surtout sur le coût du terrain, freguesia par freguesia.",
  office:
    "Bureaux : la marge repose sur le loyer de marché capitalisé et sur un foncier plus lourd dans la valeur — le front de fleuve concentre la demande.",
  hotel:
    "Hôtellerie : prix de sortie élevés côté fleuve, mais construction et foncier plus lourds ; la marge récompense les emplacements à forte fréquentation.",
  logistics:
    "Logistique : construction modérée mais prix de sortie bas ; la marge se gagne sur un foncier bon marché en périphérie.",
  retail:
    "Commerce : loyers prime élevés mais foncier très lourd dans la valeur ; la marge de promotion reste étroite hors emplacements n°1.",
};

export default function PrixMargePage() {
  const g = useGaia();
  const [selected, setSelected] = useState<string[]>([]);

  // Promotion module: default the selection to Afurada (the KREST asset's freguesia).
  useEffect(() => {
    g.setFocusZone(AFURADA);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cls = g.assetClass;
  const allRows = useMemo(() => pmRows(g.promoCity), [g.promoCity]);
  const rows = useMemo(
    () => (selected.length ? allRows.filter((r) => selected.includes(r.zone)) : allRows),
    [allRows, selected]
  );
  const summary = useMemo(() => pmSummary(allRows), [allRows]);
  const selectedRow = useMemo(
    () => allRows.find((r) => r.zone === g.focusZone) ?? null,
    [allRows, g.focusZone]
  );

  const showHaya = g.focusZone === AFURADA && cls === "residential" && !!g.hayaProps;
  const scopeLabel = summary.scope === "viables" ? "freguesias viables" : "toutes freguesias";

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
          onMode={() => { /* module épinglé sur la promotion */ }}
          assetClass={g.assetClass}
          onClass={g.setAssetClass}
          hideMode
        />

        {g.error && (
          <div className="mx-6 mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-[13px] text-red-700">
            Backend injoignable — lancez l’API (uvicorn backend.main:app). {g.error}
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
          {/* Module header */}
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-block h-5 w-1.5 rounded-full bg-gold" />
              <h2 className="font-display text-[22px] leading-none text-navy">Prix & marge</h2>
              <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[11px] font-medium text-gold-600">
                Promotion · {classLabel(cls)}
              </span>
            </div>
            <p className="mt-2 max-w-3xl pl-[18px] text-[13px] leading-relaxed text-muted">
              {CONTEXT[cls] ?? CONTEXT.residential}
            </p>
          </div>

          {/* 4 key figures — medians on viable freguesias (Go/Conditionnel) */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi
              label="Marge médiane"
              value={summary.medianMargin != null ? `${summary.medianMargin.toFixed(1)}%` : "—"}
              sub={scopeLabel}
            />
            <Kpi
              label="Freguesia la plus rentable"
              value={summary.best?.name ?? "—"}
              sub={summary.best ? `marge ${summary.best.marginPct.toFixed(1)}%` : "—"}
              small
            />
            <Kpi
              label="Prix neuf réalisable médian"
              value={eurM2(summary.medianRealizable)}
              sub={scopeLabel}
            />
            <Kpi
              label="Coût de revient médian"
              value={eurM2(summary.medianCost)}
              sub={scopeLabel}
            />
          </div>

          {/* Table — core of the page */}
          <PriceMarginTable
            rows={rows}
            mode="promotion"
            residential={cls === "residential"}
            focusZone={g.focusZone}
            onSelect={g.setFocusZone}
          />

          {/* Margin decomposition (+ Haya slider for Afurada residential) */}
          <div className={`shrink-0 ${showHaya ? "grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr]" : ""}`}>
            <MarginWaterfall row={selectedRow} mode="promotion" classLabel={classLabel(cls)} />
            {showHaya && g.hayaProps && (
              <div className="flex flex-col gap-2">
                <HayaSlider {...g.hayaProps} />
                <p className="px-1 text-[11px] leading-snug text-muted">
                  Curseur temps réel sur l’actif K-REST à Afurada : ajustez le prix de vente pour
                  voir la marge et le verdict se recalculer.
                </p>
              </div>
            )}
          </div>

          {/* Margin by freguesia chart */}
          <div className="shrink-0">
            <MarginBars
              rows={allRows}
              mode="promotion"
              focusZone={g.focusZone}
              onSelect={g.setFocusZone}
              classLabel={classLabel(cls)}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, small }: { label: string; value: string; sub?: string; small?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-navy/10 bg-white px-4 py-3.5 shadow-card">
      <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-gold/40 via-gold to-gold/40" />
      <div className="text-[11px] font-medium uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-1 font-display leading-tight text-navy ${small ? "text-[18px]" : "text-[26px] leading-none"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
