"use client";

import { Mode, scoreTextColor, verdictColor, verdictTextColor } from "@/lib/scoring";
import { eur0 } from "@/lib/priceMargin";
import { RdRow, pct2 } from "@/lib/rendement";
import { Waterfall, WaterfallEmpty } from "./Waterfall";

// Détention cascade: yield brut − charges (vacance incluse) − fiscalité = yield
// net, in yield points. Thin wrapper over the generic Waterfall.
export function YieldWaterfall({
  row,
  mode,
  classLabel,
}: {
  row: RdRow | null;
  mode: Mode;
  classLabel: string;
}) {
  if (!row) return <WaterfallEmpty />;

  const accent = verdictColor(mode, row.verdict);
  const inkVerdict = verdictTextColor(mode, row.verdict);
  // Deductions in yield points. Fiscalité from its % of rent; charges take the
  // residual so the staircase lands exactly on the published net yield.
  const fisc = (row.yieldBrut * row.fiscPctLoyer) / 100;
  const charges = row.yieldBrut - fisc - row.yieldNet;

  return (
    <Waterfall
      title={`Décomposition du rendement · ${row.name}`}
      subtitle={
        row.loyer != null
          ? `Loyer de marché ${eur0(row.loyer)} €/m²/an · yield brut ${pct2(row.yieldBrut)} · ${classLabel}`
          : `Yield brut ${pct2(row.yieldBrut)} · ${classLabel}`
      }
      mode={mode}
      verdict={row.verdict}
      headline={pct2(row.yieldNet)}
      accent={accent}
      accentText={inkVerdict}
      base={{ label: "Yield brut", value: row.yieldBrut }}
      deductions={[
        { label: "Charges & vacance", value: charges },
        { label: "Fiscalité", value: fisc },
      ]}
      resultLabel="= Yield net"
      lossLabel="= Rendement négatif"
      fmt={pct2}
      stats={[
        { label: "Loyer de marché", value: row.loyer != null ? `${eur0(row.loyer)} €/m²/an` : "–" },
        { label: "Yield net", value: pct2(row.yieldNet), accent: inkVerdict },
        { label: "Score détention", value: `${Math.round(row.total)}`, accent: scoreTextColor(row.total) },
      ]}
    />
  );
}
