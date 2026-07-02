"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Mode, MODE_LABEL, scoreColor } from "@/lib/scoring";

export interface ChartRow {
  name: string;
  short: string;
  score: number;
  price: number | null;
  verdict: string;
}

function ChartTooltip({ active, payload, unit }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ChartRow;
  const v = payload[0].value;
  return (
    <div className="rounded-lg border border-gold/40 bg-navy px-3 py-2 text-cream shadow-card">
      <div className="text-[12px] font-semibold">{d.name}</div>
      <div className="text-[12px] text-gold">
        {unit === "€/m²" ? `${Math.round(v).toLocaleString("fr-FR")} €/m²` : `${Math.round(v)} / 100 · ${d.verdict}`}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-navy/10 bg-white p-4 shadow-card">
      <h3 className="mb-2 font-display text-[15px] text-navy">{title}</h3>
      <div className="h-[230px]">{children}</div>
    </div>
  );
}

const axis = { fontSize: 10, fill: "#6B7A8D" };

export function CityCharts({ rows, mode, classLabel }: { rows: ChartRow[]; mode: Mode; classLabel: string }) {
  const priceRows = rows.filter((r) => r.price != null);
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <Panel title={`Score ${MODE_LABEL[mode]} par freguesia — ${classLabel}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 6, left: -6, bottom: 28 }}>
            <XAxis dataKey="short" tick={axis} interval={0} angle={-38} textAnchor="end" tickLine={false} axisLine={{ stroke: "#E3DCCB" }} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={axis} tickLine={false} axisLine={false} width={30} />
            <Tooltip cursor={{ fill: "rgba(10,22,40,0.05)" }} content={<ChartTooltip unit="score" />} />
            <Bar dataKey="score" radius={[3, 3, 0, 0]} maxBarSize={26}>
              {rows.map((r) => (
                <Cell key={r.name} fill={scoreColor(r.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title={`Prix médian €/m² par freguesia — ${classLabel}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={priceRows} margin={{ top: 4, right: 6, left: -6, bottom: 28 }}>
            <XAxis dataKey="short" tick={axis} interval={0} angle={-38} textAnchor="end" tickLine={false} axisLine={{ stroke: "#E3DCCB" }} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
            <Tooltip cursor={{ fill: "rgba(10,22,40,0.05)" }} content={<ChartTooltip unit="€/m²" />} />
            <Bar dataKey="price" radius={[3, 3, 0, 0]} maxBarSize={26} fill="#C9A86A" />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}
