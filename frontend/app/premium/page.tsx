"use client";

import { useMemo } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { KeyFigures } from "@/components/KeyFigures";
import { PremiumTierTable } from "@/components/PremiumTierTable";
import { PremiumCurve } from "@/components/PremiumCurve";
import { PremiumPivot } from "@/components/PremiumPivot";
import { PremiumPockets } from "@/components/PremiumPockets";
import { PremiumLandValue } from "@/components/PremiumLandValue";
import { PremiumAssets } from "@/components/PremiumAssets";
import { PremiumSustainability } from "@/components/PremiumSustainability";
import { cityBySlug } from "@/lib/cities";
import { useCityStore } from "@/lib/cityStore";
import { getPremiumCity, computeCity, type TierKey } from "@/lib/premium";
import { fmtNumber } from "@/lib/i18n/format";
import { useT, useLang } from "@/lib/i18n/useT";

// Page Premium (route /premium) : positionnement de la montee en gamme. Pas de
// maille, pas de mode, pas de classe : aucun appel reseau, on ne consomme que
// lib/premium. Le curseur de pivot, les poches, les actifs et la soutenabilite
// sont hors perimetre (lot 4).

const TIER_LABEL_KEY: Record<TierKey, string> = {
  standard: "pr.tier.standard",
  upper: "pr.tier.upper",
  prime: "pr.tier.prime",
  ultra: "pr.tier.ultra",
};

export default function PremiumPage() {
  const t = useT();
  const lang = useLang();
  const city = cityBySlug(useCityStore((s) => s.slug));
  const pc = getPremiumCity(city.slug);
  const computed = useMemo(() => (pc ? computeCity(pc) : null), [pc]);

  const tierLabel = (k: TierKey) => t(TIER_LABEL_KEY[k]);
  const eur = (v: number) => fmtNumber(Math.round(v), lang, { maximumFractionDigits: 0 });

  const figures = useMemo(() => {
    if (!pc || !computed) return [];
    const premiumPct = (pc.referencePricePerSqm / pc.medianPricePerSqm - 1) * 100;
    const pivot = computed.pivotAreaSqm;
    return [
      {
        label: t("pr.kpi.reference"),
        value: `${eur(pc.referencePricePerSqm)} ${t("pr.unit.eurSqm")}`,
      },
      {
        label: t("pr.kpi.premiumVsMedian"),
        value: `${premiumPct >= 0 ? "+" : ""}${premiumPct.toFixed(1)}%`,
      },
      {
        label: t("pr.kpi.pivot"),
        value: pivot != null ? `${pivot.toFixed(1)} ${t("pr.unit.sqm")}` : t("pr.kpi.pivotNA"),
        sub: pivot != null ? t("pr.pivot.formula") : undefined,
      },
      {
        label: t("pr.kpi.recommended"),
        value: tierLabel(pc.recommendedTier),
        sub: `${t("pr.kpi.ceiling")} · ${tierLabel(pc.ceilingTier)}`,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pc, computed, lang, t]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          marketLine={t("pr.subtitle")}
          freguesias={[]}
          selected={[]}
          onSelected={() => {}}
          mode="promotion"
          onMode={() => {}}
          assetClass="residential"
          onClass={() => {}}
          hideMode
          hideSearch
          hideClass
        />

        <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6 stagger-in">
          {!pc || !computed ? (
            <p className="text-body text-ink-soft">{t("pr.na")}</p>
          ) : (
            <>
              {/* Entete de module */}
              <div>
                <div className="flex items-center gap-3">
                  <span className="inline-block h-5 w-1.5 rounded-full bg-gold" />
                  <h2 className="font-display text-[24px] leading-none text-navy">{t("pr.title")}</h2>
                  <span className="rounded-full border border-gold/40 bg-gold/[0.06] px-2.5 py-0.5 text-label font-medium text-gold-700">
                    {city.label}
                  </span>
                </div>
                <p className="mt-2 max-w-3xl pl-[18px] text-body leading-relaxed text-ink-soft">
                  {t("pr.thesis")}
                </p>
              </div>

              {/* Bandeau KPI */}
              <KeyFigures figures={figures} />

              {/* Bloc courbe */}
              <div className="rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
                <h3 className="font-display text-[18px] text-navy">{t("pr.block.curve")}</h3>
                <p className="mt-1 text-body text-ink-soft">{t("pr.block.curveInsight")}</p>
                <div className="mt-4">
                  <PremiumCurve
                    tiers={computed.tiers}
                    recommendedTier={pc.recommendedTier}
                    tierLabel={tierLabel}
                  />
                </div>
              </div>

              {/* Table des paliers */}
              <div className="rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
                <PremiumTierTable
                  tiers={computed.tiers}
                  recommendedTier={pc.recommendedTier}
                  ceilingTier={pc.ceilingTier}
                  tierLabel={tierLabel}
                />
                <p className="mt-4 text-label text-muted">
                  {t("pr.source.label")} : {t("pr.source.cost")}
                </p>
              </div>

              {/* Bloc pivot : carte navy propre, pas de carte blanche englobante */}
              <div>
                <h3 className="font-display text-[18px] text-navy">{t("pr.block.pivot")}</h3>
                <p className="mt-1 text-body text-ink-soft">{t("pr.block.pivotInsight")}</p>
                <div className="mt-4">
                  <PremiumPivot city={pc} tiers={computed.tiers} tierLabel={tierLabel} />
                </div>
              </div>

              {/* Bloc poches */}
              <div className="rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
                <h3 className="font-display text-[18px] text-navy">{t("pr.block.pockets")}</h3>
                <p className="mt-1 text-body text-ink-soft">{t("pr.block.pocketsInsight")}</p>
                <div className="mt-4">
                  <PremiumPockets pockets={pc.pockets} medianPricePerSqm={pc.medianPricePerSqm} />
                </div>
                <p className="mt-4 text-label text-muted">
                  {t("pr.source.label")} : {t("pr.source.market")}
                </p>
              </div>

              {/* Bloc charge fonciere admissible */}
              <div className="rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
                <h3 className="font-display text-[18px] text-navy">{t("pr.block.landValue")}</h3>
                <p className="mt-1 text-body text-ink-soft">{t("pr.block.landValueInsight")}</p>
                <div className="mt-4">
                  <PremiumLandValue city={pc} tierLabel={tierLabel} />
                </div>
                <p className="mt-4 text-label text-muted">
                  {t("pr.source.label")} : {t("pr.source.cost")}
                </p>
              </div>

              {/* Bloc actifs */}
              <div className="rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
                <h3 className="font-display text-[18px] text-navy">{t("pr.block.assets")}</h3>
                <p className="mt-1 text-body text-ink-soft">{t("pr.block.assetsInsight")}</p>
                <div className="mt-4">
                  <PremiumAssets
                    assets={pc.assets}
                    referencePricePerSqm={pc.referencePricePerSqm}
                    tierLabel={tierLabel}
                  />
                </div>
                <p className="mt-4 text-label text-muted">
                  {t("pr.source.label")} : {t("pr.source.portfolio")}
                </p>
              </div>

              {/* Bloc soutenabilite */}
              <div className="rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
                <h3 className="font-display text-[18px] text-navy">{t("pr.block.sustainability")}</h3>
                <p className="mt-1 text-body text-ink-soft">{t("pr.block.sustainabilityInsight")}</p>
                <div className="mt-4">
                  <PremiumSustainability
                    drivers={pc.sustainability}
                    structuralShare={computed.structuralShare}
                    cyclicalShare={computed.cyclicalShare}
                  />
                </div>
                <p className="mt-4 text-label text-muted">
                  {t("pr.source.label")} : {t("pr.source.barzel")}
                </p>
              </div>

              {/* Notes de bas de page */}
              <div className="rounded-2xl border border-navy/10 bg-white p-5 text-label text-muted shadow-card">
                <p>{t("pr.footnote.vat")}</p>
                <p className="mt-2">{t("pr.footnote.carry")} · {t("pr.vintage")}</p>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
