"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { PriceMarginTable } from "@/components/PriceMarginTable";
import { MarginWaterfall } from "@/components/MarginWaterfall";
import { MarginBars } from "@/components/MarginBars";
import { InsightBanner } from "@/components/InsightBanner";
import { useGaia } from "@/lib/useGaia";
import { classLabel, fmtNum } from "@/lib/scoring";
import { pmRows, pmSummary, eurM2 } from "@/lib/priceMargin";
import { priceMarginInsight, anomalyNote } from "@/lib/insights";
import { cityBySlug } from "@/lib/cities";
import { useCityStore } from "@/lib/cityStore";
import { useT, useLang } from "@/lib/i18n/useT";
import { modeLabel } from "@/lib/i18n/domain";

// Ligne marché et contexte résidentiel : registre des villes (lib/cities.ts).

// Promotion economics, one line per class.
const CONTEXT: Record<string, string> = {

  office:
    "Bureaux : la marge repose sur le loyer de marché capitalisé et sur un foncier plus lourd dans la valeur. Le front de fleuve concentre la demande.",
  hotel:
    "Hôtellerie : prix de sortie élevés côté fleuve, mais construction et foncier plus lourds ; la marge récompense les emplacements à forte fréquentation.",
  logistics:
    "Logistique : construction modérée mais prix de sortie bas ; la marge se gagne sur un foncier bon marché en périphérie.",
  retail:
    "Commerce : loyers prime élevés mais foncier très lourd dans la valeur ; la marge de promotion reste étroite hors emplacements n°1.",
};

export default function PrixMargePage() {
  const g = useGaia();
  const city = cityBySlug(useCityStore((s) => s.slug));
  const t = useT();
  const lang = useLang();
  const [selected, setSelected] = useState<string[]>([]);

  // Module promotion : sélection par défaut sur la maille de l'actif vedette
  // (Afurada à Gaia, Marvila à Lisbonne) ; repli sur la maille par défaut de la
  // ville quand il n'y a pas encore d'actif vedette (Bruxelles, lot 2b).
  const assetZone = city.promoAsset?.zoneId ?? city.cityZoneId;
  const AssetSlider = city.promoAssetSlider;
  useEffect(() => {
    g.setFocusZone(assetZone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cls = g.assetClass;
  const zn = { sg: city.zoneNoun, pl: city.zoneNounPlural };  // terme de maille (commune/freguesia)
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

  const showHaya = g.focusZone === assetZone && cls === "residential" && !!g.hayaProps;
  const scopeLabel =
    summary.scope === "viables" ? t("pg.scopeViable", { zones: zn.pl }) : t("pg.scopeAll", { zones: zn.pl });

  // Conclusion layer: page insight + banner right block + margin anomaly note.
  // Le complément du gabarit « marché sélectif » vient du registre des villes
  // (« de la capitale » à Lisbonne) ; il ne se déclenche que quand les
  // Conditionnel dépassent la moitié des freguesias (jamais à Gaia).
  // Décompte autoritaire des viables (Go + Conditionnel) servi par le backend
  // (verdict_counts, maille fine hors municipio) : le texte de synthèse ne
  // recompte pas seul, il consomme le même décompte que le tableau.
  const viableCount = useMemo(() => {
    const vc = g.promoCity?.verdict_counts;
    return vc ? (vc["Go"] ?? 0) + (vc["Conditionnel"] ?? 0) : undefined;
  }, [g.promoCity]);
  const pmLine = useMemo(
    () => priceMarginInsight(allRows, cls, city.texts.promoSelectiveRest, zn, viableCount),
    [allRows, cls, city.texts.promoSelectiveRest, zn.sg, zn.pl, viableCount]
  );
  const maxRow = useMemo(
    () => (allRows.length ? allRows.reduce((a, b) => (b.marginPct > a.marginPct ? b : a)) : null),
    [allRows]
  );
  const fregScores = useMemo(
    () => (g.promoCity?.zones ?? []).filter((z) => z.level !== "municipio"),
    [g.promoCity]
  );
  const note = useMemo(() => anomalyNote("promotion", fregScores), [fregScores]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          marketLine={city.texts.marketLines.prixMarge}
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
          <div className="mx-6 mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-body text-red-700">
            {t("pg.backendError")} {g.error}
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6 stagger-in">
          {/* Module header */}
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-block h-5 w-1.5 rounded-full bg-gold" />
              <h2 className="font-display text-[24px] leading-none text-navy">{t("pgm.title")}</h2>
              <span className="rounded-full border border-gold/40 bg-gold/[0.06] px-2.5 py-0.5 text-label font-medium text-gold-700">
                {modeLabel("promotion", lang)} · {classLabel(cls)}
              </span>
            </div>
            <p className="mt-2 max-w-3xl pl-[18px] text-body leading-relaxed text-ink-soft">
              {cls === "residential" ? city.texts.promoContextResidential : CONTEXT[cls] ?? city.texts.promoContextResidential}
            </p>
          </div>

          {/* Conclusion banner (shared InsightBanner) */}
          <InsightBanner
            eyebrow={`Verdict promotion · ${classLabel(cls)}`}
            sentence={pmLine}
            right={
              maxRow ? (
                <div className="text-right">
                  <div className="text-label uppercase tracking-widest text-cream/70">{t("pgm.margin_max")} · {maxRow.short}</div>
                  <div className="font-display text-kpi-hero leading-none text-gold">{Math.round(maxRow.marginPct)}%</div>
                </div>
              ) : undefined
            }
          />

          {/* 4 key figures: medians on viable freguesias (Go/Conditionnel) */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi
              label={t("pgm.kpi_median_margin")}
              value={summary.medianMargin != null ? `${fmtNum(summary.medianMargin, 1)}%` : "–"}
              sub={scopeLabel}
            />
            {cls === "residential" ? (
              <Kpi
                label={t("pgm.kpi_median_premium")}
                value={summary.medianPremium != null ? `${Math.round(summary.medianPremium)}%` : "–"}
                sub={scopeLabel}
              />
            ) : (
              <Kpi label={t("pgm.kpi_median_land")} value={eurM2(summary.medianLand)} sub={scopeLabel} />
            )}
            <Kpi
              label={t("pgm.kpi_median_realizable")}
              value={eurM2(summary.medianRealizable)}
              sub={scopeLabel}
            />
            <Kpi
              label={t("pgm.kpi_median_cost")}
              value={eurM2(summary.medianCost)}
              sub={scopeLabel}
            />
          </div>

          {/* Table: core of the page */}
          <PriceMarginTable
            rows={rows}
            mode="promotion"
            residential={cls === "residential"}
            focusZone={g.focusZone}
            onSelect={g.setFocusZone}
          />

          {/* Analysis note: the most telling exception (if any) */}
          {note && (
            <div className="-mt-2 shrink-0 pl-1 text-body leading-snug text-ink-soft">
              <span className="text-label font-semibold uppercase tracking-widest text-gold-700">{t("pgm.analysisNote")}</span>
              <span className="mx-2 text-navy/20">·</span>
              {note}
            </div>
          )}

          {/* Margin decomposition (+ Haya slider for Afurada residential) */}
          <div className={`shrink-0 ${showHaya ? "grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr]" : ""}`}>
            <MarginWaterfall row={selectedRow} mode="promotion" classLabel={classLabel(cls)} />
            {showHaya && g.hayaProps && AssetSlider && (
              <div className="flex flex-col gap-2">
                <AssetSlider {...g.hayaProps} />
                <p className="px-1 text-caption leading-snug text-ink-soft">
                  {city.texts.promoAssetCaption}
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
      <div className="text-label font-medium uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-1 font-display leading-tight text-navy ${small ? "text-kpi-sm" : "text-kpi leading-none"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-label text-muted">{sub}</div>}
    </div>
  );
}
