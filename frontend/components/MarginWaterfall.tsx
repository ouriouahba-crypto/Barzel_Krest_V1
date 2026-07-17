"use client";

import { Mode, fmtNum, scoreTextColor, verdictColor, verdictTextColor } from "@/lib/scoring";
import { PmRow, eur0, eurM2 } from "@/lib/priceMargin";
import { Waterfall, WaterfallEmpty } from "./Waterfall";
import { useT, useLang } from "@/lib/i18n/useT";

// Promotion cascade: prix de vente − construction − foncier − frais annexes
// − financement = marge promoteur. Thin wrapper over the generic Waterfall.
export function MarginWaterfall({
  row,
  mode,
  classLabel,
}: {
  row: PmRow | null;
  mode: Mode;
  classLabel: string;
}) {
  const t = useT();
  const lang = useLang();
  if (!row) return <WaterfallEmpty />;

  const margin = row.netSale - row.costTotal;
  const marginColor = verdictColor(mode, row.verdict);
  const inkVerdict = verdictTextColor(mode, row.verdict);
  // The backend rounds each cost component separately, so their sum can drift
  // from costTotal by ±1-2 € : the soft-cost slice takes the residual so the
  // cascade lands exactly on netSale − costTotal, the "Marge / m²" tile value.
  const soft = row.costTotal - row.construction - row.land - row.finance;

  return (
    <Waterfall
      title={t("wf.marginBreakdown", { name: row.name })}
      subtitle={
        row.baseMedian != null && row.premiumPct != null
          ? t("wf.marginSubtitle", {
              price: eurM2(row.realizable, lang),
              base: eur0(row.baseMedian, lang),
              premium: Math.round(row.premiumPct),
              cls: classLabel,
            })
          : t("wf.marginSubtitleFlat", {
              cls: classLabel.toLowerCase(),
              price: eurM2(row.realizable, lang),
            })
      }
      mode={mode}
      verdict={row.verdict}
      headline={`${fmtNum(row.marginPct, 1)}%`}
      accent={marginColor}
      accentText={inkVerdict}
      base={{ label: t("wf.salePrice"), value: row.vatPct > 0 ? row.realizable : row.netSale }}
      deductions={[
        ...(row.vatPct > 0
          ? [{ label: t("wf.vat", { pct: fmtNum(row.vatPct, 0) }), value: row.realizable - row.netSale }]
          : []),
        { label: t("pm.construction"), value: row.construction },
        { label: t("pm.land"), value: row.land },
        { label: t("wf.ancillaryFees"), value: soft },
        { label: t("wf.financing"), value: row.finance },
      ]}
      resultLabel={t("wf.developerMargin")}
      lossLabel={t("wf.loss")}
      fmt={(v) => eur0(v, lang)}
      stats={[
        { label: t("wf.costPrice"), value: eurM2(row.costTotal, lang) },
        { label: margin >= 0 ? t("wf.marginPerM2") : t("wf.lossPerM2"), value: eurM2(margin, lang), accent: inkVerdict },
        { label: t("wf.scorePromotion"), value: `${Math.round(row.total)}`, accent: scoreTextColor(row.total) },
      ]}
    />
  );
}
