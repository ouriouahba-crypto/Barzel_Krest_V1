"use client";

import type { TierComputation, TierKey } from "@/lib/premium";
import { fmtNumber } from "@/lib/i18n/format";
import { useT, useLang } from "@/lib/i18n/useT";

// Table des paliers premium : une colonne par palier, une ligne par grandeur.
// Purement presentationnel (pas de tri, pas d'etat). Toute valeur affichee vient
// de la TierComputation ou d'une cle i18n ; aucune chaine ni nombre en dur.

export function PremiumTierTable({
  tiers,
  recommendedTier,
  ceilingTier,
  tierLabel,
}: {
  tiers: TierComputation[];
  recommendedTier: TierKey;
  ceilingTier: TierKey;
  tierLabel: (k: TierKey) => string;
}) {
  const t = useT();
  const lang = useLang();
  const eur = (v: number) => fmtNumber(Math.round(v), lang, { maximumFractionDigits: 0 });
  const pct1 = (v: number) => `${v.toFixed(1)}%`;

  // Une entree par grandeur : cle de libelle + lecture de la valeur dans la
  // TierComputation. Les deux dernieres (marge ajustee + taux) sont mises en avant.
  const ROWS: { key: string; get: (c: TierComputation) => string; highlight?: boolean }[] = [
    { key: "pr.col.price", get: (c) => eur(c.pricePerSqm) },
    { key: "pr.col.capex", get: (c) => eur(c.capexPerSqm) },
    { key: "pr.col.land", get: (c) => eur(c.landPerSqm) },
    { key: "pr.col.vatRate", get: (c) => `${(c.vatRate * 100).toFixed(0)}%` },
    { key: "pr.col.vat", get: (c) => eur(c.vatPerSqm) },
    { key: "pr.col.marketing", get: (c) => eur(c.marketingPerSqm) },
    { key: "pr.col.grossMargin", get: (c) => eur(c.grossMarginPerSqm) },
    { key: "pr.col.grossMarginRate", get: (c) => pct1(c.grossMarginRate * 100) },
    { key: "pr.col.absorption", get: (c) => `${c.absorptionMonths} ${t("pr.unit.months")}` },
    { key: "pr.col.carry", get: (c) => eur(c.carryPerSqm) },
    { key: "pr.col.adjustedMargin", get: (c) => eur(c.adjustedMarginPerSqm), highlight: true },
    { key: "pr.col.adjustedMarginRate", get: (c) => pct1(c.adjustedMarginRate * 100), highlight: true },
  ];

  // Mise en avant de colonne : bordure or sur le palier recommande, opacite
  // reduite au-dessus du plafond soutenable.
  const colCls = (c: TierComputation) =>
    `${c.key === recommendedTier ? "border-x-2 border-gold" : ""} ${c.aboveCeiling ? "opacity-50" : ""}`;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left align-bottom text-th text-muted">{t("pr.col.tier")}</th>
            {tiers.map((c) => (
              <th key={c.key} scope="col" className={`px-3 py-2 text-right align-bottom ${colCls(c)}`}>
                <div className="text-th font-medium text-navy">{tierLabel(c.key)}</div>
                <div className="text-label text-muted">{t("pr.tier." + c.key + "Desc")}</div>
                {c.key === recommendedTier && (
                  <div className="mt-1 inline-block rounded-full border border-gold/40 bg-gold/[0.06] px-2 py-0.5 text-label text-gold-700">
                    {t("pr.reco.recommended")}
                  </div>
                )}
                {c.aboveCeiling && <div className="mt-1 text-label text-muted">{t("pr.reco.above")}</div>}
                {c.key === ceilingTier && c.key !== recommendedTier && (
                  <div className="mt-1 text-label text-muted">{t("pr.reco.ceiling")}</div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.key} className={row.highlight ? "bg-cream/60" : ""}>
              <th
                scope="row"
                className={`px-3 py-1.5 text-left text-th ${row.highlight ? "font-medium text-navy" : "text-muted"}`}
              >
                {t(row.key)}
              </th>
              {tiers.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-1.5 text-right text-td tabular-nums ${colCls(c)} ${
                    row.highlight ? "font-medium text-navy" : ""
                  }`}
                >
                  {row.get(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
