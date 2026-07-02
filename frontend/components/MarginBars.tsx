"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Mode, verdictColor, verdictLabel } from "@/lib/scoring";
import { PmRow } from "@/lib/priceMargin";

function BarsTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as PmRow;
  return (
    <div className="rounded-lg border border-gold/40 bg-navy px-3 py-2 text-cream shadow-card">
      <div className="text-[12px] font-semibold">{d.name}</div>
      <div className="text-[12px] text-gold">
        marge {d.marginPct.toFixed(1)}% · {verdictLabel(d.verdict)}
      </div>
    </div>
  );
}

const axis = { fontSize: 10, fill: "#6B7A8D" };

export function MarginBars({
  rows,
  mode,
  focusZone,
  onSelect,
  classLabel,
}: {
  rows: PmRow[];
  mode: Mode;
  focusZone: string | null;
  onSelect: (zone: string) => void;
  classLabel: string;
}) {
  const data = [...rows].sort((a, b) => b.marginPct - a.marginPct);
  return (
    <div className="rounded-2xl border border-navy/10 bg-white p-4 shadow-card">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-display text-[15px] text-navy">Marge % par freguesia</h3>
        <span className="text-[11px] text-muted">barres par verdict · {classLabel}</span>
      </div>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 6, left: -8, bottom: 30 }}>
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
              dataKey="marginPct"
              radius={[3, 3, 0, 0]}
              maxBarSize={30}
              onClick={(d: any) => d?.payload?.zone && onSelect(d.payload.zone)}
              className="cursor-pointer"
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
      <div className="mt-1 flex items-center gap-4 pl-1 text-[11px] text-muted">
        <LegendDot color={verdictColor(mode, "Go")} label="Go" />
        <LegendDot color={verdictColor(mode, "Conditionnel")} label="Conditionnel" />
        <LegendDot color={verdictColor(mode, "Passer")} label="Passer" />
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
