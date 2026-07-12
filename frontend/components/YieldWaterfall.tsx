"use client";

import { Mode, scoreTextColor, verdictColor, verdictTextColor } from "@/lib/scoring";
import { eur0 } from "@/lib/priceMargin";
import { RdRow, pct2 } from "@/lib/rendement";
import { Waterfall, WaterfallEmpty } from "./Waterfall";
import { useT, useLang } from "@/lib/i18n/useT";

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
  const t = useT();
  const lang = useLang();
  if (!row) return <WaterfallEmpty />;

  const accent = verdictColor(mode, row.verdict);
  const inkVerdict = verdictTextColor(mode, row.verdict);
  // Deductions in yield points. Fiscalité from its % of rent; charges take the
  // residual so the staircase lands exactly on the published net yield.
  const fisc = (row.yieldBrut * row.fiscPctLoyer) / 100;
  const charges = row.yieldBrut - fisc - row.yieldNet;

  return (
    <Waterfall
      title={t("wf.yieldBreakdown", { name: row.name })}
      subtitle={
        row.loyer != null
          ? t("wf.yieldSubtitle", {
              rent: eur0(row.loyer, lang),
              gross: pct2(row.yieldBrut),
              cls: classLabel,
            })
          : t("wf.yieldSubtitleFlat", { gross: pct2(row.yieldBrut), cls: classLabel })
      }
      mode={mode}
      verdict={row.verdict}
      headline={pct2(row.yieldNet)}
      accent={accent}
      accentText={inkVerdict}
      base={{ label: t("rd.grossYield"), value: row.yieldBrut }}
      deductions={[
        { label: t("wf.chargesVacancy"), value: charges },
        { label: t("rd.tax"), value: fisc },
      ]}
      resultLabel={t("wf.netYieldEq")}
      lossLabel={t("wf.negativeYield")}
      fmt={pct2}
      stats={[
        { label: t("wf.marketRent"), value: row.loyer != null ? `${eur0(row.loyer, lang)} ${t("u.eurM2Year")}` : "–" },
        { label: t("rd.netYield"), value: pct2(row.yieldNet), accent: inkVerdict },
        { label: t("wf.scoreDetention"), value: `${Math.round(row.total)}`, accent: scoreTextColor(row.total) },
      ]}
    />
  );
}
