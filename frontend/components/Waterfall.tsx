"use client";

import React from "react";
import { Mode } from "@/lib/scoring";
import { VerdictBadge } from "./ui";

// Generic floating-bar cascade: a base bar (revenue, gross yield…) minus ordered
// deductions, stepping down to a computed result — or a dedicated loss state when
// the result is negative. MarginWaterfall (promotion) and YieldWaterfall
// (détention) are thin wrappers around this.

export interface WaterfallItem {
  label: string;
  value: number;
}

export interface WaterfallStat {
  label: string;
  value: string;
  accent?: string;
}

export function Waterfall({
  title,
  subtitle,
  mode,
  verdict,
  headline,
  accent,
  base,
  deductions,
  resultLabel,
  lossLabel,
  fmt,
  stats,
}: {
  title: string;
  subtitle: string;
  mode: Mode;
  verdict: string;
  headline: string;          // big verdict-coloured figure (e.g. "30.0%")
  accent: string;            // verdict colour for headline + result bar
  base: WaterfallItem;       // full-width opening bar
  deductions: WaterfallItem[];
  resultLabel: string;       // "= Marge promoteur", "= Yield net"
  lossLabel: string;         // negative-result label ("= Perte")
  fmt: (v: number) => string;
  stats: WaterfallStat[];
}) {
  const denom = base.value || 1;
  // Build the descending staircase (each slice removed from the running total).
  let running = base.value;
  const steps = deductions.map((c) => {
    const after = running - c.value;
    const seg = { ...c, left: (after / denom) * 100, width: (c.value / denom) * 100 };
    running = after;
    return seg;
  });
  const result = running;

  return (
    <div className="rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-[16px] leading-tight text-navy">{title}</h3>
          <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <VerdictBadge mode={mode} verdict={verdict} />
          <span className="font-display text-[22px] leading-none" style={{ color: accent }}>
            {headline}
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <WaterRow label={base.label} value={base.value} left={0} width={100} color="#C9A86A" strong fmt={fmt} />
        {steps.map((c) => (
          <WaterRow
            key={c.label}
            label={`− ${c.label}`}
            value={c.value}
            left={c.left}
            width={c.width}
            color="#1E3559"
            muted
            fmt={fmt}
          />
        ))}
        {/* Result — or a dedicated loss state when the economics don't pencil */}
        <div className="mt-1 border-t border-dashed border-navy/15 pt-2">
          {result >= 0 ? (
            <WaterRow
              label={resultLabel}
              value={result}
              left={0}
              width={(result / denom) * 100}
              color={accent}
              strong
              fmt={fmt}
            />
          ) : (
            <div className="flex items-center gap-3">
              <span className="w-[130px] shrink-0 text-[12px] font-medium" style={{ color: "#9E5B5B" }}>
                {lossLabel}
              </span>
              <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-navy/[0.04]">
                <div className="absolute inset-0 rounded-md" style={{ background: "#9E5B5B", opacity: 0.25 }} />
              </div>
              <span
                className="w-[86px] shrink-0 text-right text-[12px] font-semibold tabular-nums"
                style={{ color: "#9E5B5B" }}
              >
                {fmt(result)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {stats.map((s) => (
          <MiniStat key={s.label} label={s.label} value={s.value} accent={s.accent} />
        ))}
      </div>
    </div>
  );
}

// Empty state shared by the wrappers (no freguesia selected yet).
export function WaterfallEmpty() {
  return (
    <div className="flex h-full min-h-[280px] items-center justify-center rounded-2xl border border-navy/10 bg-white text-[13px] text-muted shadow-card">
      Sélectionnez une freguesia dans le tableau.
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
  fmt,
}: {
  label: string;
  value: number;
  left: number;
  width: number;
  color: string;
  strong?: boolean;
  muted?: boolean;
  fmt: (v: number) => string;
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
        {fmt(value)}
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
