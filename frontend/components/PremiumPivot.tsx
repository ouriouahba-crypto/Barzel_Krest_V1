"use client";

import { useState } from "react";
import type { PremiumCity, TierComputation, TierKey } from "@/lib/premium";
import { pivotAreaForPrice } from "@/lib/premium";
import { fmtNumber } from "@/lib/i18n/format";
import { useT, useLang } from "@/lib/i18n/useT";

// Bloc de bascule du regime de TVA : le seul du lot a porter un etat. Carte navy
// imposee par la reutilisation de la classe `haya-range` (piste et pouce clairs,
// invisibles sur fond clair). Markup du curseur calque sur HayaSlider.

export function PremiumPivot({
  city,
  tiers,
  tierLabel,
}: {
  city: PremiumCity;
  tiers: TierComputation[];
  tierLabel: (k: TierKey) => string;
}) {
  const t = useT();
  const lang = useLang();
  const eur = (v: number) => fmtNumber(Math.round(v), lang, { maximumFractionDigits: 0 });
  const [price, setPrice] = useState(city.referencePricePerSqm);

  // Belgique : le taux ne depend pas du prix mais de la destination du produit.
  // Pas de curseur ; comparaison sur le palier standard (tiers[0]).
  if (city.vatRegime === "BE") {
    const std = tiers[0];
    const marginFor = (vat: number) =>
      std.pricePerSqm - std.capexPerSqm - std.landPerSqm - vat - std.marketingPerSqm;
    const vatBtr = std.capexPerSqm * city.vatReduced;
    const vatSale = std.capexPerSqm * city.vatStandard;
    const marginBtr = marginFor(vatBtr);
    const marginSale = marginFor(vatSale);
    const delta = marginBtr - marginSale;
    return (
      <div className="rounded-2xl bg-navy p-5 shadow-card">
        <div className="text-label font-semibold uppercase tracking-widest text-gold">
          {t("pr.pivot.beTitle")}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <BeColumn label={t("pr.pivot.beBtr")} vat={eur(vatBtr)} margin={eur(marginBtr)} />
          <BeColumn label={t("pr.pivot.beSale")} vat={eur(vatSale)} margin={eur(marginSale)} />
        </div>
        <div className="mt-4 flex items-baseline justify-between border-t border-cream/15 pt-3">
          <span className="text-label text-cream/70">{t("pr.pivot.beDelta")}</span>
          <span className="font-display text-xl text-gold tabular-nums">
            {eur(delta)} {t("pr.unit.eurSqm")}
          </span>
        </div>
      </div>
    );
  }

  // Portugal : la TVA reduite s'applique sous une surface pivot. Le curseur la
  // recalcule en direct, ce qui fait basculer les badges de repartition.
  const min = tiers[0].pricePerSqm;
  const max = tiers[tiers.length - 1].pricePerSqm;
  const pct = ((price - min) / (max - min)) * 100;
  const pivot = pivotAreaForPrice(city, price);

  return (
    <div className="rounded-2xl bg-navy p-5 shadow-card">
      <div className="flex items-baseline justify-between">
        <span className="text-label text-cream/70">{t("pr.pivot.cursor")}</span>
        <span className="font-display text-xl text-gold tabular-nums">
          {fmtNumber(price, lang)} {t("pr.unit.eurSqm")}
        </span>
      </div>
      <input
        type="range"
        className="haya-range mt-3 w-full"
        min={min}
        max={max}
        step={50}
        value={price}
        onChange={(e) => setPrice(Number(e.target.value))}
        style={{ ["--pct" as any]: `${pct}%` }}
      />
      <div className="mt-1 flex justify-between text-label text-cream/60">
        <span>{fmtNumber(min, lang)}</span>
        <span>{fmtNumber(max, lang)}</span>
      </div>

      <div className="mt-4 flex items-baseline justify-between border-t border-cream/15 pt-3">
        <span className="text-label text-cream/70">{t("pr.pivot.result")}</span>
        <span className="font-display text-xl text-gold tabular-nums">
          {pivot != null ? `${pivot.toFixed(1)} ${t("pr.unit.sqm")}` : t("pr.kpi.pivotNA")}
        </span>
      </div>
      <p className="mt-1 text-label text-cream/60">{t("pr.pivot.formula")}</p>

      <div className="mt-4 flex flex-col gap-1.5">
        {city.tiers.map((tier) => {
          const below = pivot != null && tier.referenceAreaSqm <= pivot;
          return (
            <div key={tier.key} className="flex items-center justify-between gap-3">
              <span className="text-td text-cream/85">{tierLabel(tier.key)}</span>
              <div className="flex items-center gap-3">
                <span className="text-label tabular-nums text-cream/70">
                  {tier.referenceAreaSqm} {t("pr.unit.sqm")}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-label ${
                    below
                      ? "border-gold/40 bg-gold/[0.12] text-gold"
                      : "border-cream/25 bg-cream/[0.08] text-cream/70"
                  }`}
                >
                  {below ? t("pr.pivot.below") : t("pr.pivot.above")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Colonne d'un regime belge : TVA au m² puis marge brute correspondante, libelles
// par les cles de table du lot 3 (VAT / Gross margin).
function BeColumn({ label, vat, margin }: { label: string; vat: string; margin: string }) {
  const t = useT();
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="text-label uppercase tracking-wide text-cream/70">{label}</div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-label text-cream/70">{t("pr.col.vat")}</span>
        <span className="text-td tabular-nums text-cream/85">
          {vat} {t("pr.unit.eurSqm")}
        </span>
      </div>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-label text-cream/70">{t("pr.col.grossMargin")}</span>
        <span className="font-display text-lg tabular-nums text-gold">
          {margin} {t("pr.unit.eurSqm")}
        </span>
      </div>
    </div>
  );
}
