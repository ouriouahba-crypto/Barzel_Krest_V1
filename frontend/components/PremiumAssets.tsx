"use client";

import type { PremiumAsset, TierKey } from "@/lib/premium";
import { fmtNumber } from "@/lib/i18n/format";
import { useT, useLang } from "@/lib/i18n/useT";

// Positionnement des actifs sur la gamme : une carte par actif. Le nom d'actif est
// un nom propre (donnees), rendu tel quel. Ecart et uplift peuvent etre nuls ou
// negatifs quand l'actif est deja au niveau du prix prime : affiches tels quels.

export function PremiumAssets({
  assets,
  referencePricePerSqm,
  tierLabel,
}: {
  assets: PremiumAsset[];
  referencePricePerSqm: number;
  tierLabel: (k: TierKey) => string;
}) {
  const t = useT();
  const lang = useLang();
  const eur = (v: number) => fmtNumber(Math.round(v), lang, { maximumFractionDigits: 0 });

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {assets.map((a) => {
        const gapPct = ((referencePricePerSqm - a.pricePerSqm) / referencePricePerSqm) * 100;
        const uplift = referencePricePerSqm - a.pricePerSqm;
        return (
          <div key={a.key} className="rounded-xl border border-navy/10 bg-cream/40 p-4">
            <div className="font-display text-[17px] text-navy">{a.name}</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-label text-muted">{t("pr.asset.tier")}</span>
              <span className="rounded-full border border-gold/40 bg-gold/[0.06] px-2.5 py-0.5 text-label font-medium text-gold-700">
                {tierLabel(a.tier)}
              </span>
            </div>
            <dl className="mt-3 flex flex-col gap-1.5 text-td">
              <AssetRow label={t("pr.asset.price")} value={`${eur(a.pricePerSqm)} ${t("pr.unit.eurSqm")}`} />
              <AssetRow
                label={t("pr.asset.areaRange")}
                value={`${a.areaMinSqm} - ${a.areaMaxSqm} ${t("pr.unit.sqm")}`}
              />
              <AssetRow label={t("pr.asset.gap")} value={`${gapPct.toFixed(1)}%`} />
              <AssetRow label={t("pr.asset.uplift")} value={`${eur(uplift)} ${t("pr.unit.eurSqm")}`} />
            </dl>
          </div>
        );
      })}
    </div>
  );
}

function AssetRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums text-navy">{value}</dd>
    </div>
  );
}
