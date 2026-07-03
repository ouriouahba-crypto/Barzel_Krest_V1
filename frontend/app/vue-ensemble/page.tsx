"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { ScoreDial, VerdictBadge } from "@/components/ui";
import { OverviewRanking } from "@/components/OverviewRanking";
import { InsightBanner } from "@/components/InsightBanner";
import { PriceTrend } from "@/components/PriceTrend";
import { useGaia, displayName, shortName } from "@/lib/useGaia";
import { ModeScore } from "@/lib/api";
import { Mode, MODES, MODE_LABEL, MODE_KPI, MODE_ROUTE, classLabel, median, pillarValue, verdictColor, verdictTone } from "@/lib/scoring";
import { OverviewByMode, bestMode, cityInsight, modeInsight, trendInsight } from "@/lib/insights";
import { priceTrajectory, PricePoint } from "@/lib/priceHistory";

const MARKET_LINE =
  "Rive sud du Douro : demande soutenue, offre neuve rare côté fleuve. Quatre lectures d'un même marché.";

// Short native-metric noun per mode for the podium.
const KPI_NOUN: Record<Mode, string> = {
  promotion: "marge",
  detention: "yield net",
  arbitrage: "spread",
  landbank: "constructibilité",
};

// Every mode now has its page (MODE_ROUTE) — no "Bientôt" left on the overview.

const nn = (v: number | null | undefined): v is number => v != null && !Number.isNaN(v);
const eur = (v: number | null | undefined) => (nn(v) ? `${Math.round(v).toLocaleString("fr-FR")} €/m²` : "—");
const kpiVal = (s: ModeScore, m: Mode) => {
  const v = pillarValue(s.pillars, MODE_KPI[m].pillar);
  return v != null ? `${v.toFixed(MODE_KPI[m].digits)}${MODE_KPI[m].unit}` : "—";
};

export default function VueEnsemble() {
  const g = useGaia();
  const [selected, setSelected] = useState<string[]>([]);
  const cls = g.assetClass;

  const overview = useMemo<OverviewByMode>(() => {
    const scores: Partial<Record<Mode, ModeScore>> = {};
    const freg: Partial<Record<Mode, ModeScore[]>> = {};
    for (const m of MODES) {
      const c = g.citiesByMode[m];
      if (!c) continue;
      scores[m] = c.zones.find((z) => z.level === "municipio");
      freg[m] = c.zones.filter((z) => z.level === "freguesia");
    }
    return { scores, freg };
  }, [g.citiesByMode]);

  const bm = bestMode(overview.scores);
  const bmScore = bm ? overview.scores[bm] : undefined;
  const cityLine = cityInsight(overview, cls);

  const bmFreg = (bm && overview.freg[bm]) || [];
  const podium = useMemo(() => [...bmFreg].sort((a, b) => b.total - a.total).slice(0, 3), [bmFreg]);
  // Banner: the dominant mode's best opportunity (top-scoring freguesia), unless no
  // freguesia clears the top verdict — then fall back to the municipal score.
  const hasGood = !!bm && bmFreg.some((z) => verdictTone(bm, z.verdict) === "good");
  const topOpp = hasGood ? podium[0] : null;
  const rankRows = useMemo(
    () => bmFreg.map((z) => ({ name: displayName(z.zone_name), short: shortName(z.zone_name), total: z.total, verdict: z.verdict })),
    [bmFreg]
  );

  // Market context — the engine's municipio zone (transaction-weighted city
  // figures), the SAME source as the Carte page. Never a recomputed median.
  const market = useMemo(() => {
    const muni = (bm && overview.scores[bm]) || overview.scores.promotion;
    const rows = bmFreg.length ? bmFreg : overview.freg.promotion ?? [];
    return {
      price: muni?.price_eur_m2 ?? null,
      yoy: muni?.yoy_pct ?? null,
      tx: muni?.n_transactions ?? 0,
      count: rows.length,
    };
  }, [bm, overview.scores, bmFreg, overview.freg.promotion]);

  // Price trajectory (8 quarters) — generated from the same city price + yoy,
  // so the line lands exactly on the figures shown in the context bar.
  const trajectory = useMemo<PricePoint[]>(
    () => (nn(market.price) && nn(market.yoy) ? priceTrajectory(market.price, market.yoy, cls) : []),
    [market.price, market.yoy, cls]
  );
  const trendLine = trendInsight(trajectory, market.yoy, cls);

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
          onMode={() => {}}
          assetClass={g.assetClass}
          onClass={g.setAssetClass}
          hideMode
          hideSearch
        />

        {g.error && (
          <div className="mx-6 mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-[13px] text-red-700">
            Backend injoignable — lancez l’API (uvicorn backend.main:app). {g.error}
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
          {/* a) Verdict banner (shared InsightBanner) */}
          <InsightBanner
            eyebrow={`Verdict marché · ${classLabel(cls)}`}
            sentence={cityLine}
            right={
              bm && topOpp ? (
                <>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-cream/50">Meilleure opportunité · {MODE_LABEL[bm]}</div>
                    <div className="font-display text-lg text-cream">{shortName(topOpp.zone_name)}</div>
                    <div className="mt-1">
                      <VerdictBadge mode={bm} verdict={topOpp.verdict} />
                    </div>
                  </div>
                  <ScoreDial score={topOpp.total} size={76} />
                </>
              ) : bmScore && bm ? (
                <>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-cream/50">Meilleur mode</div>
                    <div className="font-display text-lg text-cream">{MODE_LABEL[bm]}</div>
                    <div className="mt-1">
                      <VerdictBadge mode={bm} verdict={bmScore.verdict} />
                    </div>
                  </div>
                  <ScoreDial score={bmScore.total} size={76} />
                </>
              ) : undefined
            }
          />

          {/* b) Four mode cards */}
          <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
            {MODES.map((m) => {
              const s = overview.scores[m];
              const isBest = m === bm;
              return (
                <div
                  key={m}
                  className={`flex flex-col rounded-2xl border p-4 ${
                    isBest ? "border-gold/70 bg-navy shadow-card ring-1 ring-gold/40" : "border-navy/10 bg-navy/95"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold uppercase tracking-widest text-gold/90">{MODE_LABEL[m]}</span>
                    {isBest && <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[9px] uppercase tracking-wide text-gold">Dominant</span>}
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    {s ? <ScoreDial score={s.total} size={54} /> : <div className="h-[54px] w-[54px] animate-pulse rounded-full bg-white/10" />}
                    <div className="min-w-0">
                      {s ? (
                        <>
                          <VerdictBadge mode={m} verdict={s.verdict} />
                          <div className="mt-1 truncate text-[11px] text-cream/55">{s.native_indicator?.label}</div>
                        </>
                      ) : (
                        <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
                      )}
                    </div>
                  </div>
                  <p className="mt-3 min-h-[32px] text-[11.5px] leading-snug text-cream/75">
                    {s ? modeInsight(s, cls) : ""}
                  </p>
                  {MODE_ROUTE[m] ? (
                    <Link
                      href={MODE_ROUTE[m]!}
                      className="mt-2 inline-flex items-center gap-1 self-start rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-medium text-gold transition-colors hover:bg-gold/20"
                    >
                      Explorer →
                    </Link>
                  ) : (
                    <span className="mt-2 inline-flex self-start text-[10px] uppercase tracking-wide text-cream/30">Bientôt</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* c) "Où" — podium + ranking + price trajectory. Natural heights, in
              normal flow: the page scrolls in <main> when the viewport is short
              (a compressed flex row let the chart overflow onto the context bar). */}
          <div className="grid shrink-0 grid-cols-1 gap-3 xl:grid-cols-[1fr_1.35fr_1fr]">
            <section className="flex flex-col rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="font-display text-[15px] text-navy">Où — top 3 freguesias</h3>
                <span className="text-[11px] text-muted">{bm ? MODE_LABEL[bm] : ""}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {podium.map((z, i) => (
                  <div key={z.zone} className="flex items-center gap-3 rounded-xl border border-navy/10 bg-cream-200 px-3 py-2.5">
                    <span className="font-display text-[18px] text-gold-600">{i + 1}</span>
                    <span className="h-9 w-1 rounded-full" style={{ background: verdictColor(bm as Mode, z.verdict) }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-ink">{displayName(z.zone_name)}</div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <VerdictBadge mode={bm as Mode} verdict={z.verdict} />
                        <span className="text-[11px] text-muted">
                          {bm ? `${KPI_NOUN[bm]} ${kpiVal(z, bm)}` : ""}
                        </span>
                      </div>
                    </div>
                    <ScoreDial score={z.total} size={44} light />
                  </div>
                ))}
                {!podium.length && <div className="text-[13px] text-muted">Chargement…</div>}
              </div>
            </section>

            <section className="flex flex-col rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="font-display text-[15px] text-navy">Classement des freguesias</h3>
                <span className="text-[11px] text-muted">score {bm ? MODE_LABEL[bm].toLowerCase() : ""} · par verdict</span>
              </div>
              <div className="h-[330px]">{bm && rankRows.length ? <OverviewRanking rows={rankRows} mode={bm} /> : null}</div>
            </section>

            <section className="flex flex-col rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
              <div className="mb-1 flex items-baseline justify-between">
                <h3 className="font-display text-[15px] text-navy">Trajectoire des prix</h3>
                <span className="text-[11px] text-muted">médiane ville · 8 trimestres</span>
              </div>
              <p className="mb-2 text-[11.5px] leading-snug text-muted">{trendLine}</p>
              <div className="h-[280px]">
                <PriceTrend points={trajectory} />
              </div>
            </section>
          </div>

          {/* d) Market context — one discrete line */}
          <div className="shrink-0 rounded-xl border border-navy/10 bg-cream-200 px-4 py-2 text-[12px] text-muted">
            <span className="font-medium text-ink">Contexte marché</span>
            <span className="mx-2 text-navy/20">·</span>
            Prix médian {eur(market.price)}
            <span className="mx-2 text-navy/20">·</span>
            évolution {nn(market.yoy) ? `${market.yoy >= 0 ? "+" : ""}${market.yoy.toFixed(1)}%` : "—"} sur 12 mois
            <span className="mx-2 text-navy/20">·</span>
            {market.tx.toLocaleString("fr-FR")} transactions / an
            <span className="mx-2 text-navy/20">·</span>
            {market.count} freguesias suivies
          </div>
        </main>
      </div>
    </div>
  );
}
