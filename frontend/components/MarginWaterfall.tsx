"use client";

import { Mode, scoreColor, verdictColor } from "@/lib/scoring";
import { PmRow, eur0, eurM2 } from "@/lib/priceMargin";
import { VerdictBadge } from "./ui";

// Visual cascade: prix neuf net de TVA − construction − foncier − frais annexes
// − financement = marge. Floating bars step down from revenue to margin.
export function MarginWaterfall({
  row,
  mode,
  classLabel,
}: {
  row: PmRow | null;
  mode: Mode;
  classLabel: string;
}) {
  if (!row) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center rounded-2xl border border-navy/10 bg-white text-[13px] text-muted shadow-card">
        Sélectionnez une freguesia dans le tableau.
      </div>
    );
  }

  const margin = row.netSale - row.costTotal;
  const base = row.netSale || 1;
  const marginColor = verdictColor(mode, row.verdict);

  // Build the descending staircase (each cost slice removed from the running total).
  let running = row.netSale;
  const costs = [
    { label: "Construction", value: row.construction },
    { label: "Foncier", value: row.land },
    { label: "Frais annexes", value: row.soft },
    { label: "Financement", value: row.finance },
  ].map((c) => {
    const after = running - c.value;
    const seg = { ...c, left: (after / base) * 100, width: (c.value / base) * 100 };
    running = after;
    return seg;
  });

  return (
    <div className="rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-[16px] leading-tight text-navy">
            Décomposition de la marge — {row.name}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted">
            {row.baseMedian != null && row.premiumPct != null
              ? `Prix neuf réalisable ${eurM2(row.realizable)} = médiane ancien ${eur0(row.baseMedian)} +${Math.round(row.premiumPct)}% · ${classLabel}`
              : `Prix ${classLabel.toLowerCase()} réalisable ${eurM2(row.realizable)}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <VerdictBadge mode={mode} verdict={row.verdict} />
          <span className="font-display text-[22px] leading-none" style={{ color: marginColor }}>
            {row.marginPct.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {/* Revenue base */}
        <WaterRow
          label="Prix neuf net de TVA"
          value={row.netSale}
          left={0}
          width={100}
          color="#C9A86A"
          strong
        />
        {costs.map((c) => (
          <WaterRow
            key={c.label}
            label={`− ${c.label}`}
            value={c.value}
            left={c.left}
            width={c.width}
            color="#1E3559"
            muted
          />
        ))}
        {/* Margin result — or a dedicated loss state when the deal doesn't pencil */}
        <div className="mt-1 border-t border-dashed border-navy/15 pt-2">
          {margin >= 0 ? (
            <WaterRow
              label="= Marge promoteur"
              value={margin}
              left={0}
              width={(margin / base) * 100}
              color={marginColor}
              strong
            />
          ) : (
            <div className="flex items-center gap-3">
              <span className="w-[130px] shrink-0 text-[12px] font-medium" style={{ color: "#9E5B5B" }}>
                = Perte
              </span>
              <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-navy/[0.04]">
                <div className="absolute inset-0 rounded-md" style={{ background: "#9E5B5B", opacity: 0.25 }} />
              </div>
              <span
                className="w-[86px] shrink-0 text-right text-[12px] font-semibold tabular-nums"
                style={{ color: "#9E5B5B" }}
              >
                {eur0(margin)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <MiniStat label="Coût de revient" value={eurM2(row.costTotal)} />
        <MiniStat label={margin >= 0 ? "Marge / m²" : "Perte / m²"} value={eurM2(margin)} accent={marginColor} />
        <MiniStat label="Score promotion" value={`${Math.round(row.total)}`} accent={scoreColor(row.total)} />
      </div>
    </div>
  );
}

function WaterRow({
  label,
  value,
  left,
  width,
  color,
  strong,
  muted,
}: {
  label: string;
  value: number;
  left: number;
  width: number;
  color: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`w-[130px] shrink-0 text-[12px] ${strong ? "font-medium text-ink" : "text-muted"}`}>
        {label}
      </span>
      <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-navy/[0.04]">
        <div
          className="absolute top-0 h-full rounded-md"
          style={{
            left: `${Math.max(0, left)}%`,
            width: `${Math.max(1.2, width)}%`,
            background: color,
            opacity: muted ? 0.82 : 1,
            transition: "left 0.5s cubic-bezier(0.22,1,0.36,1), width 0.5s cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      </div>
      <span className={`w-[86px] shrink-0 text-right text-[12px] tabular-nums ${strong ? "font-semibold text-navy" : "text-ink/75"}`}>
        {eur0(value)}
      </span>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex-1 rounded-xl border border-navy/10 bg-cream-200 px-3 py-2">
      <div className="text-[9.5px] uppercase tracking-wide text-muted">{label}</div>
      <div className="font-display text-[16px] leading-tight" style={{ color: accent || "#0A1628" }}>
        {value}
      </div>
    </div>
  );
}
