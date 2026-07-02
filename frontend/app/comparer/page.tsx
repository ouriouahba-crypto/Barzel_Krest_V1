"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { InsightBanner } from "@/components/InsightBanner";
import { ScoreDial, VerdictBadge } from "@/components/ui";
import { useGaia, displayName, shortName } from "@/lib/useGaia";
import { LandbankBreakdown, ModeScore } from "@/lib/api";
import { Mode, MODES, MODE_LABEL, MODE_ROUTE, classLabel, pillarValue } from "@/lib/scoring";
import { pctSigned } from "@/lib/arbitrage";
import { CompareColumn, CompareModeCell, compareInsight, compareSynthesis } from "@/lib/insights";

const SANTA = "santamarinhaesaopedrodaafurada";
const MADALENA = "madalena";
const MARKET_LINE =
  "Rive sud du Douro : un même territoire, quatre lectures — promotion, détention, arbitrage, foncier, côte à côte.";

// Native metric of each mode, read from the same pillars as the mode pages.
function cellFor(mode: Mode, z: ModeScore): CompareModeCell {
  let metric: number | null = null;
  let residual: number | null = null;
  if (mode === "landbank") {
    const b = z.pillars.find((p) => p.pillar === "constructibilite")?.breakdown as LandbankBreakdown | undefined;
    metric = b?.uplift_pct ?? null;
    residual = b?.valeur_residuelle_eur_m2 ?? null;
  } else {
    const pillar = { promotion: "marge", detention: "rendement_net", arbitrage: "spread" }[mode];
    metric = pillarValue(z.pillars, pillar);
  }
  return { mode, total: z.total, verdict: z.verdict, metric, residual };
}

function metricDisplay(c: CompareModeCell): string {
  if (c.metric == null) return "—";
  switch (c.mode) {
    case "promotion": return `marge ${c.metric.toFixed(1)}%`;
    case "detention": return `yield net ${c.metric.toFixed(2)}%`;
    case "arbitrage": return `spread ${pctSigned(c.metric)}`;
    default: return `uplift ${pctSigned(c.metric)}`;
  }
}

export default function ComparerPage() {
  const g = useGaia();
  const [selected, setSelected] = useState<string[]>([]);
  // 2 or 3 comparison slots — first two prefilled, third starts empty.
  const [picks, setPicks] = useState<(string | null)[]>([SANTA, MADALENA, null]);

  const cls = g.assetClass;

  // One column of data per picked freguesia, recomposed from the four modes
  // already prefetched for the current class (no new business computation).
  const columns = useMemo(() => {
    const out: (CompareColumn & { zone: string; price: number | null; yoy: number | null; tx: number | null })[] = [];
    for (const zone of picks) {
      if (!zone) continue;
      const cells: CompareModeCell[] = [];
      let ident: ModeScore | undefined;
      for (const m of MODES) {
        const row = g.citiesByMode[m]?.zones.find((z) => z.zone === zone && z.level === "freguesia");
        if (!row) continue;
        ident = ident ?? row;
        cells.push(cellFor(m, row));
      }
      if (!ident || cells.length < 4) continue;
      out.push({
        zone,
        name: displayName(ident.zone_name),
        short: shortName(ident.zone_name),
        cells,
        price: ident.price_eur_m2,
        yoy: ident.yoy_pct,
        tx: ident.n_transactions,
      });
    }
    return out;
  }, [picks, g.citiesByMode]);

  const synthesis = useMemo(() => compareSynthesis(columns), [columns]);
  // Right block: who wins the most modes.
  const advantage = useMemo(() => {
    if (columns.length < 2) return null;
    const wonBy = columns.map(() => 0);
    for (const m of MODES) {
      let best = -1, top = -Infinity;
      columns.forEach((c, i) => {
        const cell = c.cells.find((x) => x.mode === m);
        if (cell && cell.total > top) { top = cell.total; best = i; }
      });
      if (best >= 0) wonBy[best] += 1;
    }
    const i = wonBy.indexOf(Math.max(...wonBy));
    return { short: columns[i].short, won: wonBy[i] };
  }, [columns]);

  const setPick = (slot: number, value: string) => {
    setPicks((p) => {
      const next = [...p];
      next[slot] = value || null;
      return next;
    });
  };

  const gridCols = columns.length === 3 ? "xl:grid-cols-3" : "xl:grid-cols-2";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          marketLine={MARKET_LINE}
          freguesias={g.freguesias}
          selected={selected}
          onSelected={setSelected}
          mode="promotion"
          onMode={() => { /* page transverse : les 4 modes sont montrés */ }}
          assetClass={g.assetClass}
          onClass={g.setAssetClass}
          hideMode
        />

        {g.error && (
          <div className="mx-6 mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-[13px] text-red-700">
            Backend injoignable — lancez l'API (uvicorn backend.main:app). {g.error}
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
          {/* Module header */}
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-block h-5 w-1.5 rounded-full bg-gold" />
              <h2 className="font-display text-[22px] leading-none text-navy">Comparer</h2>
              <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[11px] font-medium text-gold-600">
                4 modes · {classLabel(cls)}
              </span>
            </div>
            <p className="mt-2 max-w-3xl pl-[18px] text-[13px] leading-relaxed text-muted">
              Deux ou trois freguesias côte à côte, à travers les quatre lectures du même marché —
              la couche de décision avant d'entrer dans chaque module.
            </p>
          </div>

          {/* Selection slots — always three, the third starts empty */}
          <div className="grid shrink-0 grid-cols-1 gap-4 xl:grid-cols-3">
            {[0, 1, 2].map((slot) => {
              const value = picks[slot] ?? "";
              const taken = picks.filter((p, i) => p && i !== slot);
              const options = g.freguesias.filter((f) => !taken.includes(f.id));
              return (
                <select
                  key={slot}
                  value={value}
                  onChange={(e) => setPick(slot, e.target.value)}
                  className={`w-full cursor-pointer rounded-xl border bg-white px-3 py-2.5 text-[13px] shadow-card outline-none transition-colors ${
                    value ? "border-navy/15 text-ink" : "border-dashed border-gold/50 text-gold-600"
                  }`}
                >
                  {slot === 2 ? (
                    <option value="">{value ? "— Retirer —" : "+ Ajouter une freguesia"}</option>
                  ) : (
                    !value && <option value="">Choisir une freguesia…</option>
                  )}
                  {options.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              );
            })}
          </div>

          {/* One column per selected freguesia */}
          <div className={`grid shrink-0 grid-cols-1 gap-4 ${gridCols}`}>
            {columns.map((col) => (
              <section key={col.zone} className="flex flex-col rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
                <h3 className="font-display text-[17px] leading-tight text-navy">{col.name}</h3>

                {/* a) carte d'identité */}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Ident label="Prix médian" value={col.price != null ? `${Math.round(col.price).toLocaleString("fr-FR")} €/m²` : "—"} />
                  <Ident label="Sur 12 mois" value={col.yoy != null ? `${col.yoy >= 0 ? "+" : ""}${col.yoy.toFixed(1)}%` : "—"} />
                  <Ident label="Transactions" value={col.tx != null ? `${col.tx.toLocaleString("fr-FR")} / an` : "—"} sub="tous segments" />
                </div>

                {/* b) les 4 modes empilés */}
                <div className="mt-4 flex flex-col divide-y divide-navy/[0.06]">
                  {col.cells.map((c) => (
                    <div key={c.mode} className="flex items-center gap-3 py-2.5">
                      <ScoreDial score={c.total} size={44} light />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                            {MODE_LABEL[c.mode]}
                          </span>
                          <VerdictBadge mode={c.mode} verdict={c.verdict} />
                        </div>
                        <div className="mt-0.5 truncate text-[12.5px] text-ink/80">{metricDisplay(c)}</div>
                      </div>
                      <Link
                        href={MODE_ROUTE[c.mode]}
                        className="shrink-0 text-[11px] font-medium text-gold-600 transition-colors hover:text-gold"
                      >
                        Voir en détail →
                      </Link>
                    </div>
                  ))}
                </div>

                {/* c) signal dominant */}
                <div className="mt-auto border-t border-dashed border-navy/15 pt-3">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-gold-600">Signal dominant</span>
                  <p className="mt-1 text-[12.5px] leading-snug text-ink/85">{compareInsight(col.cells)}</p>
                </div>
              </section>
            ))}
            {columns.length === 0 && (
              <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-navy/10 bg-white text-[13px] text-muted shadow-card xl:col-span-2">
                Chargement des freguesias…
              </div>
            )}
          </div>

          {/* Comparative synthesis */}
          {synthesis && (
            <InsightBanner
              eyebrow={`Synthèse comparative · ${classLabel(cls)}`}
              sentence={synthesis}
              right={
                advantage ? (
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-cream/50">Avantage · {advantage.short}</div>
                    <div className="font-display text-[40px] leading-none text-gold">{advantage.won} / 4</div>
                    <div className="text-[10px] text-cream/50">modes en tête</div>
                  </div>
                ) : undefined
              }
            />
          )}
        </main>
      </div>
    </div>
  );
}

function Ident({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-navy/10 bg-cream-200 px-3 py-2">
      <div className="text-[9.5px] uppercase tracking-wide text-muted">{label}</div>
      <div className="font-display text-[15px] leading-tight text-navy">{value}</div>
      {sub && <div className="text-[9.5px] text-muted">{sub}</div>}
    </div>
  );
}
