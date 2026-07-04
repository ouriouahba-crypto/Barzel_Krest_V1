"use client";

import { Mode, scoreTextColor, verdictColor, verdictTextColor } from "@/lib/scoring";
import { PmRow, eur0, eurM2 } from "@/lib/priceMargin";
import { Waterfall, WaterfallEmpty } from "./Waterfall";

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
      title={`Décomposition de la marge · ${row.name}`}
      subtitle={
        row.baseMedian != null && row.premiumPct != null
          ? `Prix neuf réalisable ${eurM2(row.realizable)} = médiane ancien ${eur0(row.baseMedian)} +${Math.round(row.premiumPct)}% · ${classLabel}`
          : `Prix ${classLabel.toLowerCase()} réalisable ${eurM2(row.realizable)}`
      }
      mode={mode}
      verdict={row.verdict}
      headline={`${row.marginPct.toFixed(1)}%`}
      accent={marginColor}
      accentText={inkVerdict}
      base={{ label: "Prix de vente", value: row.netSale }}
      deductions={[
        { label: "Construction", value: row.construction },
        { label: "Foncier", value: row.land },
        { label: "Frais annexes", value: soft },
        { label: "Financement", value: row.finance },
      ]}
      resultLabel="= Marge promoteur"
      lossLabel="= Perte"
      fmt={eur0}
      stats={[
        { label: "Coût de revient", value: eurM2(row.costTotal) },
        { label: margin >= 0 ? "Marge / m²" : "Perte / m²", value: eurM2(margin), accent: inkVerdict },
        { label: "Score promotion", value: `${Math.round(row.total)}`, accent: scoreTextColor(row.total) },
      ]}
    />
  );
}
