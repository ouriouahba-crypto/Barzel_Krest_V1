"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { ScoreDial, VerdictBadge } from "@/components/ui";
import { OverviewRanking } from "@/components/OverviewRanking";
import { InsightBanner } from "@/components/InsightBanner";
import { PriceTrend } from "@/components/PriceTrend";
import { Skeleton } from "@/components/motion/Skeleton";
import { useGaia, displayName, shortName } from "@/lib/useGaia";
import { ModeScore } from "@/lib/api";
import { Mode, MODES, MODE_KPI, MODE_ROUTE, fmtNum, fmtSigned, median, pillarValue, verdictColor, verdictTone } from "@/lib/scoring";
import { useT, useLang } from "@/lib/i18n/useT";
import { fmtNumber } from "@/lib/i18n/format";
import type { Lang } from "@/lib/i18n/types";
import { classLabelFor, modeLabel, verdictDisplay } from "@/lib/i18n/domain";
import { composeNativeIndicator } from "@/lib/nativeLabels";
import { translate } from "@/lib/i18n";
import { cityShortName } from "@/lib/i18n/display";
import { OverviewByMode, bestMode, cityInsight, modeInsight, trendInsight } from "@/lib/insights";
import { priceTrajectory, PricePoint } from "@/lib/priceHistory";
import { cityBySlug } from "@/lib/cities";
import { useCityStore } from "@/lib/cityStore";
import { SignalAffordance } from "@/components/collab/SignalAffordance";

// Ligne marché : registre des villes (lib/cities.ts).

// Short native-metric noun per mode for the podium. Cles nat.noun.* : leur FR est
// byte-identique aux libelles historiques codes ici en dur (« yield net », et non
// « rendement net » comme ci.metricNoun.detention).
const kpiNoun = (m: Mode, lang: Lang) => translate(`nat.noun.${m}`, lang);

// Every mode now has its page (MODE_ROUTE): no "Bientôt" left on the overview.

const nn = (v: number | null | undefined): v is number => v != null && !Number.isNaN(v);
const eur = (v: number | null | undefined, lang: Lang) => (nn(v) ? `${fmtNumber(Math.round(v), lang)} €/m²` : "–");
const kpiVal = (s: ModeScore, m: Mode) => {
  const v = pillarValue(s.pillars, MODE_KPI[m].pillar);
  return v != null ? `${fmtNum(v, MODE_KPI[m].digits)}${MODE_KPI[m].unit}` : "–";
};

// Proxy « vue ville » pour une ville sans municipio agrégé (ex. Bruxelles : 19
// communes, aucun municipio) : la maille au score médian sert de représentant,
// avec prix/yoy médians et transactions sommées pour la barre de contexte.
// Gaia/Lisbonne ont un municipio : ce repli ne les touche jamais.
function synthCity(fine: ModeScore[]): ModeScore | undefined {
  if (!fine.length) return undefined;
  const rep = [...fine].sort((a, b) => a.total - b.total)[Math.floor((fine.length - 1) / 2)];
  const price = median(fine.map((z) => (z.price_eur_m2 ?? NaN) as number));
  const yoy = median(fine.map((z) => (z.yoy_pct ?? NaN) as number));
  const tx = fine.reduce((s, z) => s + (z.n_transactions ?? 0), 0);
  return {
    ...rep,
    price_eur_m2: nn(price) ? price : rep.price_eur_m2,
    yoy_pct: nn(yoy) ? yoy : rep.yoy_pct,
    n_transactions: tx,
  };
}

export default function VueEnsemble() {
  const t = useT();
  const lang = useLang();
  const g = useGaia();
  const slug = useCityStore((s) => s.slug);
  const city = cityBySlug(slug);
  const [selected, setSelected] = useState<string[]>([]);
  const cls = g.assetClass;

  const overview = useMemo<OverviewByMode>(() => {
    const scores: Partial<Record<Mode, ModeScore>> = {};
    const freg: Partial<Record<Mode, ModeScore[]>> = {};
    for (const m of MODES) {
      const c = g.citiesByMode[m];
      if (!c) continue;
      const fine = c.zones.filter((z) => z.level !== "municipio");
      freg[m] = fine;
      // Vue ville = municipio du moteur ; à défaut (Bruxelles, sans municipio),
      // proxy synthétique sur les communes.
      scores[m] = c.zones.find((z) => z.level === "municipio") ?? synthCity(fine);
    }
    return { scores, freg };
  }, [g.citiesByMode]);

  const bm = bestMode(overview.scores);
  const bmScore = bm ? overview.scores[bm] : undefined;
  const cityLine = cityInsight(overview, cls, { sg: city.zoneNoun, pl: city.zoneNounPlural }, lang);

  const bmFreg = (bm && overview.freg[bm]) || [];
  const podium = useMemo(() => [...bmFreg].sort((a, b) => b.total - a.total).slice(0, 3), [bmFreg]);
  // Banner: the dominant mode's best opportunity (top-scoring freguesia), unless no
  // freguesia clears the top verdict; then fall back to the municipal score.
  const hasGood = !!bm && bmFreg.some((z) => verdictTone(bm, z.verdict) === "good");
  const topOpp = hasGood ? podium[0] : null;
  const rankRows = useMemo(
    () => bmFreg.map((z) => ({ name: displayName(z.zone_name), short: shortName(z.zone_name), total: z.total, verdict: z.verdict })),
    [bmFreg]
  );

  // Market context: the engine's municipio zone (transaction-weighted city
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

  // Price trajectory (8 quarters), generated from the same city price + yoy,
  // so the line lands exactly on the figures shown in the context bar.
  const trajectory = useMemo<PricePoint[]>(
    () => (nn(market.price) && nn(market.yoy) ? priceTrajectory(market.price, market.yoy, cls) : []),
    [market.price, market.yoy, cls]
  );
  const trendLine = trendInsight(trajectory, market.yoy, cls, cityShortName(city.slug, lang), lang);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          marketLine={t(city.texts.marketLines.vueEnsemble)}
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
          <div className="mx-6 mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-body text-red-700">
            {t("pg.backendError")} {g.error}
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6 stagger-in">
          {/* a) Verdict banner (shared InsightBanner) */}
          <InsightBanner
            eyebrow={`${t("ov.verdictEyebrow")} · ${classLabelFor(cls, lang)}`}
            sentence={cityLine}
            right={
              bm && topOpp ? (
                <>
                  <div className="text-right">
                    <div className="text-label uppercase tracking-widest text-cream/70">{t("ov.best_opportunity", { mode: modeLabel(bm, lang) })}</div>
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
                    <div className="text-label uppercase tracking-widest text-cream/70">{t("ov.best_mode")}</div>
                    <div className="font-display text-lg text-cream">{modeLabel(bm, lang)}</div>
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
          <div className="grid shrink-0 grid-cols-2 gap-3 stagger-in xl:grid-cols-4">
            {MODES.map((m) => {
              const s = overview.scores[m];
              const isBest = m === bm;
              return (
                <div
                  key={m}
                  className={`group/sig relative flex flex-col rounded-2xl border p-4 ${
                    isBest ? "border-gold/70 bg-navy shadow-card ring-1 ring-gold/40" : "border-navy/10 bg-navy/95"
                  }`}
                >
                  {/* Signalement au survol (lot C3) : ancré au verdict ville du mode. */}
                  {s && (
                    <SignalAffordance
                      citySlug={slug}
                      anchor={{
                        kind: "verdict",
                        label: `${modeLabel(m, lang)} · ${verdictDisplay(s.verdict, lang)}`,
                        route: MODE_ROUTE[m] ?? "/vue-ensemble",
                      }}
                    />
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-label font-semibold uppercase tracking-widest text-gold/90">{modeLabel(m, lang)}</span>
                    {isBest && <span className="rounded-full bg-gold/20 px-2 py-0.5 text-label uppercase tracking-wide text-gold">{t("ov.dominant")}</span>}
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    {s ? <ScoreDial score={s.total} size={54} /> : <div className="h-[54px] w-[54px] animate-pulse rounded-full bg-white/10" />}
                    <div className="min-w-0">
                      {s ? (
                        <>
                          <VerdictBadge mode={m} verdict={s.verdict} />
                          <div className="mt-1 truncate text-caption text-cream/85">
                            {composeNativeIndicator(s, m, lang) ?? s.native_indicator?.label}
                          </div>
                        </>
                      ) : (
                        <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
                      )}
                    </div>
                  </div>
                  <p className="mt-3 min-h-[32px] text-body leading-snug text-cream/90">
                    {s ? modeInsight(s, cls, lang) : ""}
                  </p>
                  {MODE_ROUTE[m] ? (
                    <Link
                      href={MODE_ROUTE[m]!}
                      className="mt-2 inline-flex items-center gap-1 self-start rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1 text-btn font-medium text-gold transition-colors hover:bg-gold/20"
                    >
                      {t("ov.explore")}
                    </Link>
                  ) : (
                    <span className="mt-2 inline-flex self-start text-label uppercase tracking-wide text-cream/50">{t("ov.soon")}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* c) "Où" : podium + ranking + price trajectory. Natural heights, in
              normal flow: the page scrolls in <main> when the viewport is short
              (a compressed flex row let the chart overflow onto the context bar). */}
          <div className="grid shrink-0 grid-cols-1 gap-3 xl:grid-cols-[1fr_1.35fr_1fr]">
            <section className="flex flex-col rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="font-display text-[16px] text-navy">{t("ov.podium_title", { zones: city.zoneNounPlural })}</h3>
                <span className="text-label text-muted">{bm ? modeLabel(bm, lang) : ""}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {podium.map((z, i) => (
                  <div key={z.zone} className="group/sig relative flex items-center gap-3 rounded-xl border border-navy/10 bg-cream-200 px-3 py-2.5">
                    {/* Signalement au survol (lot C3) : ancré à la maille, ramène à la carte. */}
                    <SignalAffordance
                      citySlug={slug}
                      anchor={{ kind: "zone", label: displayName(z.zone_name), zoneId: z.zone, route: "/gaia" }}
                    />
                    <span className="font-display text-kpi-sm text-gold-700">{i + 1}</span>
                    <span className="h-9 w-1 rounded-full" style={{ background: verdictColor(bm as Mode, z.verdict) }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-body font-medium text-ink">{displayName(z.zone_name)}</div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <VerdictBadge mode={bm as Mode} verdict={z.verdict} />
                        <span className="text-caption text-ink-soft">
                          {bm ? `${kpiNoun(bm, lang)} ${kpiVal(z, bm)}` : ""}
                        </span>
                      </div>
                    </div>
                    <ScoreDial score={z.total} size={44} light />
                  </div>
                ))}
                {!podium.length && (
                  <>
                    <Skeleton className="h-[52px] w-full" />
                    <Skeleton className="h-[52px] w-full" />
                    <Skeleton className="h-[52px] w-full" />
                  </>
                )}
              </div>
            </section>

            <section className="flex flex-col rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="font-display text-[16px] text-navy">{t("ov.ranking_title", { zones: city.zoneNounPlural })}</h3>
                <span className="text-label text-muted">{t("ov.ranking_subtitle", { mode: bm ? modeLabel(bm, lang).toLowerCase() : "" })}</span>
              </div>
              <div>{bm && rankRows.length ? <OverviewRanking rows={rankRows} mode={bm} /> : <Skeleton className="h-[280px] w-full" />}</div>
            </section>

            <section className="flex flex-col rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
              <div className="mb-1 flex items-baseline justify-between">
                <h3 className="font-display text-[16px] text-navy">{t("ov.price_trajectory")}</h3>
                <span className="text-label text-muted">{t("ov.city_median_8q")}</span>
              </div>
              <p className="mb-2 text-body leading-snug text-ink-soft">{trendLine}</p>
              <div className="h-[280px]">
                <PriceTrend points={trajectory} />
              </div>
            </section>
          </div>

          {/* d) Market context: one discrete line */}
          <div className="shrink-0 rounded-xl border border-navy/10 bg-cream-200 px-4 py-2.5 text-caption text-ink-soft">
            <span className="font-medium text-ink">{t("ov.market_context")}</span>
            <span className="mx-2 text-navy/20">·</span>
            {t("ov.median_price", { v: eur(market.price, lang) })}
            <span className="mx-2 text-navy/20">·</span>
            {t("ov.yoy_12m", { v: nn(market.yoy) ? `${fmtSigned(market.yoy, 1)}%` : "–" })}
            <span className="mx-2 text-navy/20">·</span>
            {t("ov.transactions_per_year", { n: fmtNumber(market.tx, lang) })}
            <span className="mx-2 text-navy/20">·</span>
            {t("ov.zones_tracked", { n: market.count, zones: city.zoneNounPlural })}
          </div>
        </main>
      </div>
    </div>
  );
}
