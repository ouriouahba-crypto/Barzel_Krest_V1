"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PricePoint } from "@/lib/priceHistory";

// Sober city-price trajectory (8 quarters) : one navy 2px line on white, gold
// final dot, recessive grid, direct labels on first & last points only — the
// third "Où" panel of the overview. Single series → no legend, the title names it.

function TrendTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as PricePoint;
  return (
    <div className="rounded-lg border border-gold/40 bg-navy px-3 py-2 text-cream shadow-card">
      <div className="text-label font-semibold">{d.t}</div>
      <div className="text-label text-gold">{d.price.toLocaleString("fr-FR")} €/m²</div>
    </div>
  );
}

// Gold end-point marker; every other point stays invisible (hover reveals values).
function EndDot(props: any) {
  const { cx, cy, index, dataLength } = props;
  if (index !== dataLength - 1) return null;
  return <circle cx={cx} cy={cy} r={4.5} fill="#C9A86A" stroke="#A8854B" strokeWidth={1.5} />;
}

export function PriceTrend({ points }: { points: PricePoint[] }) {
  if (!points.length) return <div className="flex h-full items-center justify-center text-body text-ink-soft">Chargement…</div>;
  const first = points[0];
  const last = points[points.length - 1];
  const label = ({ x, y, index }: any) => {
    if (index !== 0 && index !== points.length - 1) return <g key={index} />;
    const p = index === 0 ? first : last;
    const anchor = index === 0 ? "start" : "end";
    return (
      <text key={index} x={x} y={y - 9} textAnchor={anchor} fontSize={12} fill="#243447" fontWeight={index === 0 ? 400 : 600}>
        {p.price.toLocaleString("fr-FR")}
      </text>
    );
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 18, right: 14, left: 20, bottom: 2 }}>
        <CartesianGrid vertical={false} stroke="rgba(10,22,40,0.07)" />
        <XAxis
          dataKey="t"
          tick={{ fontSize: 12, fill: "#6B7A8D" }}
          tickLine={false}
          axisLine={{ stroke: "rgba(10,22,40,0.12)" }}
          interval={1}
        />
        <YAxis hide domain={["dataMin - 90", "dataMax + 70"]} />
        <Tooltip cursor={{ stroke: "rgba(10,22,40,0.15)" }} content={<TrendTooltip />} />
        <Line
          dataKey="price"
          stroke="#1E3559"
          strokeWidth={2}
          dot={<EndDot dataLength={points.length} />}
          activeDot={{ r: 4, fill: "#1E3559", stroke: "#fff", strokeWidth: 1.5 }}
          label={label}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
