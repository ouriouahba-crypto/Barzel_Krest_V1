"use client";

import { Mode, scoreTextColor, verdictColor, verdictTextColor } from "@/lib/scoring";
import { eur0, eurM2 } from "@/lib/priceMargin";
import { ArbRow, pctSigned } from "@/lib/arbitrage";
import { Waterfall, WaterfallEmpty } from "./Waterfall";
import { useT } from "@/lib/i18n/useT";

// Arbitrage cascade: valeur réalisable − frais de cession − décote de
// négociation = produit net, with the spread vs the median as the headline.
// Thin wrapper over the generic Waterfall.
export function SpreadWaterfall({
  row,
  mode,
  classLabel,
  baseLabel,
}: {
  row: ArbRow | null;
  mode: Mode;
  classLabel: string;
  // Suffixe de la base du spread, DATA-DRIVEN côté page : « de la ville »
  // (médiane ville, base constante) vs « de la freguesia »/« de la commune »
  // (médiane maille) ; repli « de marché ».
  baseLabel: string;
}) {
  const t = useT();
  if (!row || row.valeurRealisable == null) return <WaterfallEmpty />;

  const accent = verdictColor(mode, row.verdict);
  const inkVerdict = verdictTextColor(mode, row.verdict);
  const frais = (row.valeurRealisable * row.fraisPct) / 100;
  const decote = (row.valeurRealisable * (row.decotePct ?? 0)) / 100;
  const produitNet = row.valeurRealisable - frais - decote;

  return (
    <Waterfall
      title={t("wf.spreadBreakdown", { name: row.name })}
      subtitle={`Spread ${pctSigned(row.spreadPct)} vs médiane ${baseLabel} ${eurM2(row.prixMarche)} · ${classLabel}`}
      mode={mode}
      verdict={row.verdict}
      headline={pctSigned(row.spreadPct)}
      accent={accent}
      accentText={inkVerdict}
      base={{ label: t("ar.realizableValue"), value: row.valeurRealisable }}
      deductions={[
        { label: t("wf.disposalFees"), value: frais },
        { label: t("wf.negotiationDiscount"), value: decote },
      ]}
      resultLabel={t("wf.netProceedsEq")}
      lossLabel={t("wf.loss")}
      fmt={eur0}
      stats={[
        { label: t("wf.netProceeds"), value: eurM2(produitNet) },
        { label: t("wf.disposalTime"), value: row.delaiMois != null ? `${row.delaiMois.toFixed(1)} ${t("ar.months")}` : "–" },
        { label: t("wf.scoreArbitrage"), value: `${Math.round(row.total)}`, accent: scoreTextColor(row.total) },
      ]}
    />
  );
}
