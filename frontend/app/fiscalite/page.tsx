"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { InsightBanner } from "@/components/InsightBanner";
import { Segmented } from "@/components/ui";
import { useGaia } from "@/lib/useGaia";
import { pmRows } from "@/lib/priceMargin";
import { rdRows } from "@/lib/rendement";
import { cityBySlug } from "@/lib/cities";
import { useCityStore } from "@/lib/cityStore";
import { useT, useLang } from "@/lib/i18n/useT";
import { cityShortName } from "@/lib/i18n/display";

// Page transverse de contexte fiscal. Tout le contenu spécifique au régime du
// pays (barèmes, volets, points de contrôle, textes, simulateur) vient de la
// config par ville (lib/cities.ts → city.fiscal / city.fiscalSimulator) : un
// régime BE se branche pour Bruxelles sans toucher cette page.

// La fiscalité ne distingue que résidentiel / commercial : le sélecteur
// 5 classes est remplacé par un toggle local (bureaux alimente l'insight du
// cycle de détention commercial côté moteur).
const REGIMES = [
  { value: "residential" },
  { value: "commercial" },
] as const;
type Regime = (typeof REGIMES)[number]["value"];

export default function FiscalitePage() {
  const t = useT();
  const lang = useLang();
  const g = useGaia();
  const city = cityBySlug(useCityStore((s) => s.slug));
  const F = city.fiscal;
  const FiscalSimulator = city.fiscalSimulator;
  const [selected, setSelected] = useState<string[]>([]);
  const [regime, setRegime] = useState<Regime>("residential");
  const residential = regime === "residential";
  const regimeOptions: { value: Regime; label: string }[] = [
    { value: "residential", label: t("fsc.regime_residential") },
    { value: "commercial", label: t("fsc.regime_commercial") },
  ];
  const regimeLabel = residential ? t("fsc.regime_residential") : t("fsc.regime_commercial");

  const onRegime = (r: Regime) => {
    setRegime(r);
    g.setAssetClass(r === "residential" ? "residential" : "office");
  };

  // Banner sentence computed from the same engine-served rows as the mode pages.
  const pm = useMemo(() => pmRows(g.promoCity), [g.promoCity]);
  const rd = useMemo(() => rdRows(g.detentionCity), [g.detentionCity]);
  const cityName = cityShortName(city.slug, lang);
  const sentence = useMemo(
    () => F.fiscalInsight(residential ? "residential" : "commercial", pm, rd, cityName, lang),
    [F, residential, pm, rd, cityName, lang]
  );
  const entryMax = F.entryMaxPct(residential);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          marketLine={city.texts.fiscaliteMarketLine ? t(city.texts.fiscaliteMarketLine) : t(F.PAGE.marketLine)}
          freguesias={g.freguesias}
          selected={selected}
          onSelected={setSelected}
          mode="promotion"
          onMode={() => { /* page transverse */ }}
          assetClass={g.assetClass}
          onClass={g.setAssetClass}
          hideMode
          hideSearch
          hideClass
        />

        <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
          {/* Module header : toggle de régime local (le droit fiscal ne
              distingue que résidentiel / commercial) */}
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-block h-5 w-1.5 rounded-full bg-gold" />
              <h2 className="font-display text-[24px] leading-none text-navy">{t("fsc.title")}</h2>
              <span className="rounded-full border border-gold/40 bg-gold/[0.06] px-2.5 py-0.5 text-label font-medium text-gold-700">
                {t(F.PAGE.chipPrefix)} · {regimeLabel}
              </span>
              <div className="ml-2 flex items-center gap-3">
                <span className="text-label font-semibold uppercase tracking-widest text-muted">{t("fsc.regime_label")}</span>
                <Segmented options={regimeOptions} value={regime} onChange={onRegime} />
              </div>
            </div>
            <p className="mt-2 max-w-3xl pl-[18px] text-body leading-relaxed text-ink-soft">
              {t(F.PAGE.intro)}
            </p>
          </div>

          {/* Fiscal weight of the cycle */}
          <InsightBanner
            eyebrow={`${t(F.PAGE.bannerEyebrowPrefix)} · ${regimeLabel}`}
            sentence={sentence}
            right={
              <div className="text-right">
                <div className="text-label uppercase tracking-widest text-cream/70">{t(F.PAGE.entryMaxLabel)}</div>
                <div className="font-display text-kpi-hero leading-none text-gold">{F.pctFR(entryMax, lang)}</div>
                <div className="text-label text-cream/70">{t(F.PAGE.entryMaxSub)}</div>
              </div>
            }
          />

          {/* Volets du cycle (Acquérir / Détenir / Céder pour le régime PT).
              volets(lang) rend des chaînes DEJA traduites : pas de t() ici. */}
          <div className="grid shrink-0 grid-cols-1 gap-4 xl:grid-cols-3">
            {F.volets(lang).map((v) => (
              <Volet key={v.title} title={v.title} eyebrow={v.eyebrow}>
                {v.rows.map((r) => (
                  <Row key={r.label} label={r.label} value={r.value} sub={r.sub} />
                ))}
                <Platform to={v.platform.to} label={v.platform.label} />
              </Volet>
            ))}
          </div>

          {/* Checkpoints + simulator (simulateur = curseur : absent pour Bruxelles,
              lot 2b-ii → la table de contrôle occupe alors toute la largeur) */}
          <div className={`grid shrink-0 grid-cols-1 gap-4 ${FiscalSimulator ? "xl:grid-cols-[1.35fr_1fr]" : ""}`}>
            <section className="rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
              <h3 className="font-display text-[16px] leading-tight text-navy">
                {t(F.PAGE.checkpointsTitle(residential))}
              </h3>
              <p className="mt-0.5 text-label text-muted">
                {t(F.PAGE.checkpointsSub)}
              </p>
              <table className="mt-3 w-full border-collapse text-td">
                <thead>
                  <tr className="border-b border-navy/10 text-left text-th font-semibold uppercase tracking-wide text-ink-soft">
                    {F.PAGE.checkpointCols.map((c, i) => (
                      <th key={c} className={i === 0 ? "py-2 pr-3" : "px-3 py-2 text-right"}>{t(c)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {F.CHECKPOINTS.map((p) => {
                    const tax = F.acquisitionTaxes(p, residential);
                    return (
                      <tr key={p} className="border-b border-navy/[0.06]">
                        <td className="py-2.5 pr-3 font-medium text-ink">{F.eurFR(p, lang)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink/80">{F.eurFR(tax.imt, lang)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink/80">{F.eurFR(tax.selo, lang)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-ink">{F.eurFR(tax.total, lang)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-display text-[16px] text-navy">{tax.pct.toFixed(1)}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {residential && (
                <p className="mt-3 text-caption leading-snug text-ink-soft">
                  {t(F.PAGE.baremeNote, F.PAGE.baremeParams)}
                </p>
              )}
            </section>

            {FiscalSimulator && (
              <div className="flex flex-col gap-2">
                <FiscalSimulator residential={residential} />
                <p className="px-1 text-caption leading-snug text-ink-soft">
                  {t(F.PAGE.simulatorCaption)}
                </p>
              </div>
            )}
          </div>

          {/* Discreet source line */}
          <p className="shrink-0 pl-1 text-label text-muted">
            {t(F.PAGE.sources)}
          </p>
        </main>
      </div>
    </div>
  );
}

function Volet({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
      <div className="text-label font-semibold uppercase tracking-widest text-gold-700">{eyebrow}</div>
      <h3 className="mt-0.5 font-display text-kpi-sm leading-tight text-navy">{title}</h3>
      <div className="mt-3 flex flex-1 flex-col divide-y divide-navy/[0.06]">{children}</div>
    </section>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="text-body font-medium leading-snug text-ink">{label}</div>
        {sub && <div className="text-caption leading-snug text-ink-soft">{sub}</div>}
      </div>
      <div className="shrink-0 font-display text-[16px] text-navy">{value}</div>
    </div>
  );
}

function Platform({ to, label }: { to: string; label: string }) {
  const t = useT();
  return (
    <div className="mt-auto pt-3">
      <Link
        href={to}
        className="block rounded-xl border border-gold/30 bg-gold/[0.07] px-3 py-2 text-btn leading-snug text-gold-700 transition-colors hover:bg-gold/15"
      >
        <span className="font-semibold uppercase tracking-wide text-label">{t("pg.inPlatform")}</span>
        <br />
        {label} →
      </Link>
    </div>
  );
}
