"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { ScoreCards } from "@/components/ScoreCards";
import { DetailPanel, KeyFigure } from "@/components/DetailPanel";
import { KeyFigures } from "@/components/KeyFigures";
import { CityCharts } from "@/components/CityCharts";
import { MapLegendBar, RankingList } from "@/components/CityBits";
import { useGaia } from "@/lib/useGaia";
import { Mode, MODE_KPI, classLabel } from "@/lib/scoring";
import { ModeScore } from "@/lib/api";

const GaiaMap = dynamic(() => import("@/components/GaiaMap"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-navy text-cream/50">Carte…</div>,
});

const MARKET_LINE =
  "Rive sud du Douro en forte progression, demande soutenue et offre neuve rare côté fleuve. Afurada et Canidelo tirent le marché.";

function detailFigures(score: ModeScore, mode: Mode): KeyFigure[] {
  const figs: KeyFigure[] = [];
  if (score.price_eur_m2 != null) figs.push({ label: "Prix médian", value: `${Math.round(score.price_eur_m2).toLocaleString("fr-FR")} €/m²` });
  const p = score.pillars.find((x) => x.pillar === MODE_KPI[mode].pillar && x.applicable);
  if (p) figs.push({ label: p.pillar.replace(/_/g, " "), value: p.native.label });
  return figs;
}

export default function VueEnsemble() {
  const g = useGaia();
  const [selected, setSelected] = useState<string[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);

  const onSelectZone = (zoneId?: string) => {
    if (!zoneId) return;
    g.setFocusZone(zoneId);
    setDetailOpen(true);
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
          mode={g.mode}
          onMode={g.setMode}
          assetClass={g.assetClass}
          onClass={g.setAssetClass}
        />

        {g.error && (
          <div className="mx-6 mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-[13px] text-red-700">
            Backend injoignable — lancez l’API (uvicorn backend.main:app). {g.error}
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              {g.isCityView ? "Vue ville — Vila Nova de Gaia" : `Zone — ${g.focusName}`}
              <span className="ml-2 text-gold-600">· {classLabel(g.assetClass)}</span>
            </span>
            {!g.isCityView && (
              <button
                onClick={() => g.setFocusZone(g.cityZoneId)}
                className="rounded-full border border-navy/15 bg-white px-3 py-1 text-[12px] text-navy/70 hover:border-gold/50"
              >
                ← Revenir à la ville
              </button>
            )}
          </div>

          <KeyFigures figures={g.figures} />

          <ScoreCards scores={g.cardScores} activeMode={g.mode} onMode={g.setMode} zoneName={g.focusName} classLabel={classLabel(g.assetClass)} />

          <div className="grid grid-cols-1 gap-4 xl:h-[620px] xl:grid-cols-[1.78fr_1fr]">
            <div className="flex min-h-0 flex-col gap-2.5">
              <div className="h-[560px] shrink-0 overflow-hidden rounded-2xl border border-navy/10 shadow-card">
                <GaiaMap scoresByNorm={g.scoresByNorm} selected={selected} onSelectZone={onSelectZone} hayaNorm={g.hayaNorm} mode={g.mode} focusZoneId={g.focusZone} />
              </div>
              <MapLegendBar min={g.scoreRange.min} max={g.scoreRange.max} />
            </div>
            <section className="hidden xl:block">
              <div className="flex h-full flex-col rounded-2xl border border-navy/10 bg-cream-200 p-5 shadow-card">
                <RankingList city={g.city} selected={selected} focus={g.focusZone} onSelect={onSelectZone} />
              </div>
            </section>
          </div>

          <CityCharts rows={g.chartRows} mode={g.mode} classLabel={classLabel(g.assetClass)} />
        </main>
      </div>

      <DetailPanel
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        score={g.detailScore}
        mode={g.mode}
        keyFigures={g.detailScore ? detailFigures(g.detailScore, g.mode) : []}
        haya={g.hayaProps}
      />
    </div>
  );
}
