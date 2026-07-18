"use client";

import { useMemo, useState } from "react";
import type { PremiumCity, TierKey } from "@/lib/premium";
import { admissibleLandTable } from "@/lib/premium/compute";
import { fmtNumber } from "@/lib/i18n/format";
import { useT, useLang } from "@/lib/i18n/useT";

// Charge fonciere admissible (lot 6) : la question du promoteur detenteur de
// foncier, "combien puis-je payer le terrain ici en tenant ma marge cible".
// Une ligne par poche, palier apparie, triee par charge admissible decroissante.
// Le curseur de marge cible vit sur carte blanche : la classe haya-range est
// dessinee pour fond sombre, on ne la reutilise pas ici (curseur natif).

export function PremiumLandValue({
  city,
  tierLabel,
}: {
  city: PremiumCity;
  tierLabel: (k: TierKey) => string;
}) {
  const t = useT();
  const lang = useLang();
  const eur = (v: number) => fmtNumber(Math.round(v), lang, { maximumFractionDigits: 0 });
  const [target, setTarget] = useState(0.15);
  const rows = useMemo(() => admissibleLandTable(city, target), [city, target]);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-label text-muted">{t("pr.land.targetMargin")}</span>
        <span className="font-display text-xl text-gold-700 tabular-nums">
          {(target * 100).toFixed(0)}%
        </span>
      </div>
      <input
        type="range"
        className="mt-3 w-full accent-gold"
        min={0.05}
        max={0.30}
        step={0.01}
        value={target}
        onChange={(e) => setTarget(Number(e.target.value))}
      />

      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-navy/10">
              <th className="px-3 py-2 text-left text-th text-muted">{t("pr.depth.pocket")}</th>
              <th className="px-3 py-2 text-right text-th text-muted">{t("pr.depth.pocketPrice")}</th>
              <th className="px-3 py-2 text-left text-th text-muted">{t("pr.land.matchedTier")}</th>
              <th className="px-3 py-2 text-right text-th text-muted">{t("pr.col.vatRate")}</th>
              <th className="px-3 py-2 text-right text-th text-muted">{t("pr.land.admissible")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.pocketKey}
                className={`border-b border-navy/5 ${row.viable ? "" : "opacity-60"}`}
              >
                <th scope="row" className="px-3 py-2 text-left text-td font-medium text-navy">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{row.pocketName}</span>
                    {i === 0 && row.viable ? (
                      <span className="rounded-full border border-gold/40 bg-gold/[0.06] px-2 py-0.5 text-label text-gold-700">
                        {t("pr.land.best")}
                      </span>
                    ) : null}
                    {row.viable ? null : (
                      <span className="text-label text-muted">{t("pr.land.notViable")}</span>
                    )}
                  </div>
                </th>
                <td className="px-3 py-2 text-right text-td tabular-nums">
                  {eur(row.pocketPricePerSqm)} {t("pr.unit.eurSqm")}
                </td>
                <td className="px-3 py-2 text-left text-td">{tierLabel(row.tierKey)}</td>
                <td
                  className={`px-3 py-2 text-right text-td tabular-nums ${
                    row.vatRate === city.vatStandard ? "text-gold-700 font-medium" : ""
                  }`}
                >
                  {(row.vatRate * 100).toFixed(0)}%
                </td>
                <td className="px-3 py-2 text-right text-td tabular-nums font-medium text-navy">
                  {eur(row.admissibleLandPerSqm)} {t("pr.unit.eurSqm")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-label text-muted">{t("pr.land.legend")}</p>
      <p className="mt-1 text-label text-muted">{t("pr.land.formula")}</p>
    </div>
  );
}
