"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Mode, verdictColor, verdictLabel } from "@/lib/scoring";

export interface RankRow {
  name: string;
  short: string;
  total: number;
  verdict: string;
}

function RankTooltip({ active, payload, mode }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as RankRow;
  return (
    <div className="rounded-lg border border-gold/40 bg-navy px-3 py-2 text-cream shadow-card">
      <div className="text-[12px] font-semibold">{d.name}</div>
      <div className="text-[12px] text-gold">
        {Math.round(d.total)} / 100 · {verdictLabel(d.verdict)}
      </div>
    </div>
  );
}

// Horizontal ranking of freguesias by the dominant mode's score, coloured by verdict.
export function OverviewRanking({ rows, mode }: { rows: RankRow[]; mode: Mode }) {
  const data = [...rows].sort((a, b) => a.total - b.total); // recharts stacks bottom-up
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 2, right: 30, left: 6, bottom: 2 }} barCategoryGap={3}>
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis
          type="category"
          dataKey="short"
          width={104}
          tick={{ fontSize: 10.5, fill: "#243447" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip cursor={{ fill: "rgba(10,22,40,0.05)" }} content={<RankTooltip mode={mode} />} />
        <Bar dataKey="total" radius={[0, 3, 3, 0]} maxBarSize={16} label={{ position: "right", fontSize: 10, fill: "#6B7A8D", formatter: (v: number) => Math.round(v) }}>
          {data.map((r) => (
            <Cell key={r.name} fill={verdictColor(mode, r.verdict)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
