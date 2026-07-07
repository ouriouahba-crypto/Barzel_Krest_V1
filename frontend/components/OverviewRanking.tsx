"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Mode, verdictColor, verdictLabel } from "@/lib/scoring";
import { usePrefersReducedMotion } from "@/lib/motion";

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
      <div className="text-label font-semibold">{d.name}</div>
      <div className="text-label text-gold">
        {Math.round(d.total)} / 100 · {verdictLabel(d.verdict)}
      </div>
    </div>
  );
}

// Horizontal ranking of freguesias by the dominant mode's score, coloured by
// verdict. Générique au nombre de zones (15 à Gaia, 24 à Lisbonne) : hauteur
// calculée par barre et interval 0 sur l'axe ET les étiquettes de valeur,
// aucune décimation Recharts quelle que soit la taille de la ville.
const ROW_H = 24; // ~24px par barre (Gaia 15 × 24 = 360, hauteur historique)

export function OverviewRanking({ rows, mode }: { rows: RankRow[]; mode: Mode }) {
  const reduce = usePrefersReducedMotion();
  const data = [...rows].sort((a, b) => a.total - b.total); // recharts stacks bottom-up
  return (
    <div style={{ height: Math.max(1, rows.length) * ROW_H }}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 2, right: 30, left: 6, bottom: 2 }} barCategoryGap={3}>
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis
          type="category"
          dataKey="short"
          width={118}
          tick={{ fontSize: 12, fill: "#243447" }}
          tickLine={false}
          axisLine={false}
          interval={0}
        />
        <Tooltip cursor={{ fill: "rgba(10,22,40,0.05)" }} content={<RankTooltip mode={mode} />} />
        <Bar dataKey="total" radius={[0, 3, 3, 0]} maxBarSize={16} isAnimationActive={!reduce} animationDuration={800} animationEasing="ease-out">
          {/* LabelList explicite = une étiquette par barre, sans décimation
              (l'équivalent d'interval 0 ; la prop n'existe pas sur LabelList,
              qui ne décime jamais, contrairement au label d'axe). */}
          <LabelList
            dataKey="total"
            position="right"
            fontSize={12}
            fill="#3D4C5F"
            formatter={(v: number) => Math.round(v)}
          />
          {data.map((r) => (
            <Cell key={r.name} fill={verdictColor(mode, r.verdict)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}
