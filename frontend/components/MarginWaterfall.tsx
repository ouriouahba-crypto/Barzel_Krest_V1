"use client";

import { Mode, fmtNum, scoreTextColor, verdictColor, verdictTextColor } from "@/lib/scoring";
import { PmRow, eur0, eurM2 } from "@/lib/priceMargin";
import { Waterfall, WaterfallEmpty } from "./Waterfall";
import { useT } from "@/lib/i18n/useT";

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
          ? `Prix neuf réalisable ${eurM2(row.realizable)} = médiane ancien ${eur0(row.baseMedian)} +${Math.round(row.premiumPct)}% · ${classLabel}`
          : `Prix ${classLabel.toLowerCase()} réalisable ${eurM2(row.realizable)}`
      }
      mode={mode}
      verdict={row.verdict}
      headline={`${fmtNum(row.marginPct, 1)}%`}
      accent={marginColor}
      accentText={inkVerdict}
      base={{ label: t("wf.salePrice"), value: row.netSale }}
      deductions={[
        { label: t("pm.construction"), value: row.construction },
        { label: t("pm.land"), value: row.land },
        { label: t("wf.ancillaryFees"), value: soft },
        { label: t("wf.financing"), value: row.finance },
      ]}
      resultLabel={t("wf.developerMargin")}
      lossLabel={t("wf.loss")}
      fmt={eur0}
      stats={[
        { label: t("wf.costPrice"), value: eurM2(row.costTotal) },
        { label: margin >= 0 ? t("wf.marginPerM2") : t("wf.lossPerM2"), value: eurM2(margin), accent: inkVerdict },
        { label: t("wf.scorePromotion"), value: `${Math.round(row.total)}`, accent: scoreTextColor(row.total) },
      ]}
    />
  );
}
