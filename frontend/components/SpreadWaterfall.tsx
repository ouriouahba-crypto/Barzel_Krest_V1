"use client";

import { Mode, scoreColor, verdictColor } from "@/lib/scoring";
import { eur0, eurM2 } from "@/lib/priceMargin";
import { ArbRow, pctSigned } from "@/lib/arbitrage";
import { Waterfall, WaterfallEmpty } from "./Waterfall";

// Arbitrage cascade: valeur réalisable − frais de cession − décote de
// négociation = produit net, with the spread vs the median as the headline.
// Thin wrapper over the generic Waterfall.
export function SpreadWaterfall({
  row,
  mode,
  classLabel,
}: {
  row: ArbRow | null;
  mode: Mode;
  classLabel: string;
}) {
  if (!row || row.valeurRealisable == null) return <WaterfallEmpty />;

  const accent = verdictColor(mode, row.verdict);
  const frais = (row.valeurRealisable * row.fraisPct) / 100;
  const decote = (row.valeurRealisable * (row.decotePct ?? 0)) / 100;
  const produitNet = row.valeurRealisable - frais - decote;

  return (
    <Waterfall
      title={`Décomposition de la cession — ${row.name}`}
      subtitle={`Prix marché ${eurM2(row.prixMarche)} · spread ${pctSigned(row.spreadPct)} vs médiane · ${classLabel}`}
      mode={mode}
      verdict={row.verdict}
      headline={pctSigned(row.spreadPct)}
      accent={accent}
      base={{ label: "Valeur réalisable", value: row.valeurRealisable }}
      deductions={[
        { label: "Frais de cession", value: frais },
        { label: "Décote de négociation", value: decote },
      ]}
      resultLabel="= Produit net"
      lossLabel="= Perte"
      fmt={eur0}
      stats={[
        { label: "Produit net", value: eurM2(produitNet) },
        { label: "Délai de cession", value: row.delaiMois != null ? `${row.delaiMois.toFixed(1)} mois` : "—" },
        { label: "Score arbitrage", value: `${Math.round(row.total)}`, accent: scoreColor(row.total) },
      ]}
    />
  );
}
