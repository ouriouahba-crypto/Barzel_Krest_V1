"use client";

import type { PremiumPocket } from "@/lib/premium";
import { fmtNumber } from "@/lib/i18n/format";
import { useT, useLang } from "@/lib/i18n/useT";

// Poches premium : une ligne par poche, triee par prix decroissant. Les noms de
// poches sont des toponymes (donnees), rendus tels quels ; tout le reste passe
// par une cle i18n. Presentationnel, sans etat.

export function PremiumPockets({
  pockets,
  medianPricePerSqm,
}: {
  pockets: PremiumPocket[];
  medianPricePerSqm: number;
}) {
  const t = useT();
  const lang = useLang();
  const eur = (v: number) => fmtNumber(Math.round(v), lang, { maximumFractionDigits: 0 });
  const rows = [...pockets].sort((a, b) => b.pricePerSqm - a.pricePerSqm);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-navy/10">
            <th className="px-3 py-2 text-left text-th text-muted">{t("pr.depth.pocket")}</th>
            <th className="px-3 py-2 text-right text-th text-muted">{t("pr.depth.pocketPrice")}</th>
            <th className="px-3 py-2 text-right text-th text-muted">{t("pr.depth.premium")}</th>
            <th className="px-3 py-2 text-right text-th text-muted">{t("pr.depth.units")}</th>
            <th className="px-3 py-2 text-left text-th text-muted">{t("pr.depth.driver")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const premium = (p.pricePerSqm / medianPricePerSqm - 1) * 100;
            return (
              <tr key={p.key} className="border-b border-navy/5">
                <th scope="row" className="px-3 py-2 text-left text-td font-medium text-navy">
                  {p.name}
                </th>
                <td className="px-3 py-2 text-right text-td tabular-nums">
                  {eur(p.pricePerSqm)} {t("pr.unit.eurSqm")}
                </td>
                <td className="px-3 py-2 text-right text-td tabular-nums">
                  {`${premium >= 0 ? "+" : ""}${premium.toFixed(1)}%`}
                </td>
                <td className="px-3 py-2 text-right text-td tabular-nums">
                  {p.depthUnitsPerYear} {t("pr.unit.unitsYear")}
                </td>
                <td className="px-3 py-2 text-left">
                  <div className="flex flex-wrap gap-1.5">
                    {p.drivers.map((d) => (
                      <span
                        key={d}
                        className="rounded-full border border-navy/15 bg-cream/60 px-2 py-0.5 text-label text-ink-soft"
                      >
                        {t("pr.driver." + d)}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
