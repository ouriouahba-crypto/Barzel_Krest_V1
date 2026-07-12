"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Mode, fmtNum, verdictColor } from "@/lib/scoring";
import { useZoneNoun } from "@/lib/useZoneNoun";
import { usePrefersReducedMotion } from "@/lib/motion";
import { useT, useLang } from "@/lib/i18n/useT";
import { verdictDisplay } from "@/lib/i18n/domain";

// Verdict-coloured bars per freguesia, parameterised by metric + labels so each
// mode page reuses it (promotion: marge %, détention: yield net %, …). Defaults
// keep the historical "Prix & marge" behaviour.

export interface BarRowBase {
  zone: string;
  name: string;
  short: string;
  verdict: string;
}

// Verdict ladder per mode, for the legend (backend ASCII labels; display accented).
const LEGEND: Record<Mode, string[]> = {
  promotion: ["Go", "Conditionnel", "Passer"],
  detention: ["Conserver", "Surveiller", "Ceder"],
  arbitrage: ["Fenetre ouverte", "Fenetre etroite", "Fenetre fermee"],
  landbank: ["Prioritaire", "A phaser", "En attente"],
};

const axis = { fontSize: 12, fill: "#6B7A8D" };

export function MarginBars<T extends BarRowBase>({
  rows,
  mode,
  focusZone,
  onSelect,
  classLabel,
  metric = (r) => (r as any).marginPct as number,
  title,
  metricLabel,
  digits = 1,
}: {
  rows: T[];
  mode: Mode;
  focusZone: string | null;
  onSelect: (zone: string) => void;
  classLabel: string;
  metric?: (r: T) => number;
  title?: string;
  metricLabel?: string;
  digits?: number;
}) {
  const { sg } = useZoneNoun();
  const t = useT();
  const lang = useLang();
  const reduce = usePrefersReducedMotion();
  // Titre par défaut piloté par le terme de maille de la ville (« Marge % par
  // commune » à Bruxelles). Les pages qui passent un titre explicite priment.
  const heading = title ?? t("mb.title", { sg });
  const metricName = metricLabel ?? t("mb.metricMargin");
  const data = rows
    .map((r) => ({ ...r, __value: metric(r) }))
    .sort((a, b) => b.__value - a.__value);

  function BarsTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as T & { __value: number };
    return (
      <div className="rounded-lg border border-gold/40 bg-navy px-3 py-2 text-cream shadow-card">
        <div className="text-label font-semibold">{d.name}</div>
        <div className="text-label text-gold">
          {metricName} {fmtNum(d.__value, digits)}% · {verdictDisplay(d.verdict, lang)}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-navy/10 bg-white p-4 shadow-card">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-display text-[16px] text-navy">{heading}</h3>
        <span className="text-label text-muted">{t("mb.subtitle", { cls: classLabel })}</span>
      </div>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 6, left: -8, bottom: 42 }}>
            <XAxis
              dataKey="short"
              tick={axis}
              interval={0}
              angle={-38}
              textAnchor="end"
              tickLine={false}
              axisLine={{ stroke: "#E3DCCB" }}
            />
            <YAxis
              tick={axis}
              tickLine={false}
              axisLine={false}
              width={34}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip cursor={{ fill: "rgba(10,22,40,0.05)" }} content={<BarsTooltip />} />
            <Bar
              dataKey="__value"
              radius={[3, 3, 0, 0]}
              maxBarSize={30}
              onClick={(d: any) => d?.payload?.zone && onSelect(d.payload.zone)}
              className="cursor-pointer"
              isAnimationActive={!reduce}
              animationDuration={800}
              animationEasing="ease-out"
            >
              {data.map((r) => (
                <Cell
                  key={r.zone}
                  fill={verdictColor(mode, r.verdict)}
                  fillOpacity={focusZone && r.zone !== focusZone ? 0.45 : 1}
                  stroke={r.zone === focusZone ? "#0A1628" : "none"}
                  strokeWidth={r.zone === focusZone ? 1.5 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* verdict legend */}
      <div className="mt-1 flex items-center gap-4 pl-1 text-label text-muted">
        {LEGEND[mode].map((v) => (
          <LegendDot key={v} color={verdictColor(mode, v)} label={verdictDisplay(v, lang)} />
        ))}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
