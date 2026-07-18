"use client";

import {
  Bar,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TierComputation, TierKey } from "@/lib/premium";
import { fmtNumber } from "@/lib/i18n/format";
import { usePrefersReducedMotion } from "@/lib/motion";
import { useT, useLang } from "@/lib/i18n/useT";

// Courbe de gamme : barres empilees de la decomposition de marge par palier, plus
// la marge ajustee en ligne sur un axe droit. L'or (marge brute) monte, le navy
// (marge ajustee) plafonne : le croisement se lit la ou le message se lit.

const axis = { fontSize: 12, fill: "#6B7A8D" };

// Series de barres, du bas vers le haut de la pile, avec leur cle de legende.
const SERIES: { dataKey: string; labelKey: string; color: string }[] = [
  { dataKey: "capexPerSqm", labelKey: "pr.chart.capex", color: "#16294A" },
  { dataKey: "landPerSqm", labelKey: "pr.chart.land", color: "#1E3559" },
  { dataKey: "vatPerSqm", labelKey: "pr.chart.vat", color: "#85683A" },
  { dataKey: "marketingPerSqm", labelKey: "pr.chart.marketing", color: "#6B7A8D" },
  { dataKey: "grossMarginPerSqm", labelKey: "pr.chart.margin", color: "#C9A86A" },
];
const ADJUSTED = { dataKey: "adjustedPct", labelKey: "pr.chart.adjusted", color: "#0A1628" };
const MARGIN_KEY = "grossMarginPerSqm";

export function PremiumCurve({
  tiers,
  recommendedTier,
  tierLabel,
}: {
  tiers: TierComputation[];
  recommendedTier: TierKey;
  tierLabel: (k: TierKey) => string;
}) {
  const t = useT();
  const lang = useLang();
  const reduce = usePrefersReducedMotion();
  const eur = (v: number) => fmtNumber(Math.round(v), lang, { maximumFractionDigits: 0 });

  const data = tiers.map((c) => ({
    key: c.key,
    capexPerSqm: c.capexPerSqm,
    landPerSqm: c.landPerSqm,
    vatPerSqm: c.vatPerSqm,
    marketingPerSqm: c.marketingPerSqm,
    grossMarginPerSqm: c.grossMarginPerSqm,
    adjustedPct: c.adjustedMarginRate * 100,
  }));

  function CurveTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as Record<string, number>;
    return (
      <div className="rounded-xl border border-navy/10 bg-white p-3 text-td shadow-card">
        {SERIES.map((s) => (
          <div key={s.dataKey} className="flex items-center justify-between gap-6">
            <span className="inline-flex items-center gap-1.5 text-ink-soft">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {t(s.labelKey)}
            </span>
            <span className="font-medium tabular-nums text-navy">{eur(row[s.dataKey])}</span>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between gap-6 border-t border-navy/10 pt-1">
          <span className="text-ink-soft">{t(ADJUSTED.labelKey)}</span>
          <span className="font-medium tabular-nums text-navy">{row.adjustedPct.toFixed(1)}%</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-3 font-display text-[16px] text-navy">{t("pr.chart.title")}</h3>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <XAxis
            dataKey="key"
            tick={axis}
            interval={0}
            tickLine={false}
            axisLine={{ stroke: "#E3DCCB" }}
            tickFormatter={(k: TierKey) => tierLabel(k)}
          />
          <YAxis
            yAxisId="left"
            tick={axis}
            tickLine={false}
            axisLine={false}
            label={{
              value: t("pr.chart.axisLeft"),
              angle: -90,
              position: "insideLeft",
              fill: "#6B7A8D",
              fontSize: 12,
              style: { textAnchor: "middle" },
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, "auto"]}
            tick={axis}
            tickLine={false}
            axisLine={false}
            label={{
              value: t("pr.chart.axisRight"),
              angle: 90,
              position: "insideRight",
              fill: "#6B7A8D",
              fontSize: 12,
              style: { textAnchor: "middle" },
            }}
          />
          <Tooltip cursor={{ fill: "rgba(10,22,40,0.05)" }} content={<CurveTooltip />} />
          {SERIES.map((s) => (
            <Bar
              key={s.dataKey}
              yAxisId="left"
              dataKey={s.dataKey}
              stackId="a"
              fill={s.color}
              isAnimationActive={!reduce}
              animationDuration={800}
              animationEasing="ease-out"
            >
              {tiers.map((c) => (
                <Cell
                  key={c.key}
                  fillOpacity={c.aboveCeiling ? 0.45 : 1}
                  stroke={s.dataKey === MARGIN_KEY && c.key === recommendedTier ? "#C9A86A" : undefined}
                  strokeWidth={s.dataKey === MARGIN_KEY && c.key === recommendedTier ? 2 : undefined}
                />
              ))}
            </Bar>
          ))}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="adjustedPct"
            stroke={ADJUSTED.color}
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={!reduce}
            animationDuration={800}
            animationEasing="ease-out"
          />
        </ComposedChart>
      </ResponsiveContainer>
      {/* Legende : chaque serie de barres plus la ligne de marge ajustee. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-1 text-label text-muted">
        {[...SERIES, ADJUSTED].map((s) => (
          <span key={s.dataKey} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {t(s.labelKey)}
          </span>
        ))}
      </div>
    </div>
  );
}
