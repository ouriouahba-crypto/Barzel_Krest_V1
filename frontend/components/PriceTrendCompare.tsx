"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { QUARTER_LABELS, type PricePoint } from "@/lib/priceHistory";
import { usePrefersReducedMotion } from "@/lib/motion";
import { useLang, useT } from "@/lib/i18n/useT";
import { fmtNumber } from "@/lib/i18n/format";
import type { Lang } from "@/lib/i18n/types";

// Multi-series price trajectory for the compare page: one line per selected
// freguesia/commune, each anchored on that zone's real median price + yoy via
// the shared deterministic priceTrajectory() (same mechanic as the overview,
// so it stays coherent). White card, gold-accented tooltip, direct legend.
// Simulated history, replaced by the client's real per-zone series later.

export interface CompareSeries {
  zone: string; // stable id, used as recharts dataKey
  name: string; // zone label (legend + tooltip)
  color: string;
  points: PricePoint[]; // 8 quarters
}

function CompareTooltip({ active, payload, label, series, lang }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gold/40 bg-navy px-3 py-2 text-cream shadow-card">
      <div className="text-label font-semibold">{label}</div>
      {payload.map((p: any) => {
        const s = (series as CompareSeries[]).find((x) => x.zone === p.dataKey);
        return (
          <div key={p.dataKey} className="mt-0.5 flex items-center gap-2 text-label">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="text-cream/80">{s?.name ?? p.dataKey}</span>
            <span className="ml-auto font-semibold text-gold">{fmtNumber(p.value, lang as Lang)} €/m²</span>
          </div>
        );
      })}
    </div>
  );
}

export function PriceTrendCompare({ series }: { series: CompareSeries[] }) {
  const reduce = usePrefersReducedMotion();
  const lang = useLang();
  const t = useT();
  if (!series.length)
    return (
      <div className="flex h-full items-center justify-center text-body text-ink-soft">{t("pg.loading")}</div>
    );

  // Common dataset: one row per quarter, one key per zone.
  const data = QUARTER_LABELS.map((q, i) => {
    const row: Record<string, number | string> = { t: q };
    for (const s of series) row[s.zone] = s.points[i]?.price ?? 0;
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 24, left: 8, bottom: 2 }}>
        <CartesianGrid vertical={false} stroke="rgba(10,22,40,0.07)" />
        <XAxis
          dataKey="t"
          tick={{ fontSize: 12, fill: "#6B7A8D" }}
          tickLine={false}
          axisLine={{ stroke: "rgba(10,22,40,0.12)" }}
        />
        <YAxis
          width={56}
          tick={{ fontSize: 11, fill: "#6B7A8D" }}
          tickLine={false}
          axisLine={false}
          domain={["dataMin - 90", "dataMax + 90"]}
          tickFormatter={(v: number) => fmtNumber(Math.round(v), lang)}
        />
        <Tooltip cursor={{ stroke: "rgba(10,22,40,0.15)" }} content={<CompareTooltip series={series} lang={lang} />} />
        <Legend
          verticalAlign="top"
          align="right"
          height={28}
          iconType="circle"
          formatter={(value: string) => {
            const s = series.find((x) => x.zone === value);
            return <span style={{ color: "#243447", fontSize: 13 }}>{s?.name ?? value}</span>;
          }}
        />
        {series.map((s) => (
          <Line
            key={s.zone}
            dataKey={s.zone}
            name={s.zone}
            stroke={s.color}
            strokeWidth={2.4}
            dot={{ r: 2.2, fill: s.color, strokeWidth: 0 }}
            activeDot={{ r: 4.5, fill: s.color, stroke: "#fff", strokeWidth: 1.5 }}
            isAnimationActive={!reduce}
            animationDuration={1100}
            animationEasing="ease-out"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
