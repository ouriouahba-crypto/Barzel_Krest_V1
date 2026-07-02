"use client";

import { useState } from "react";
import { MONTE, landbankVerdict, scoreColor, upliftSubscore } from "@/lib/scoring";
import { pctSigned } from "@/lib/arbitrage";
import { FcRow } from "@/lib/foncier";
import { VerdictBadge } from "./ui";

const USAGE_ORDER = ["residential", "office", "hotel", "logistics", "retail"];

// Live, client-side recompute for the K-REST landbank asset (Monte Claro,
// réserve foncière à Canidelo). Instead of a slider: a 5-usage selector that
// recomputes the plot's residual value, its uplift vs the zone land market and
// the verdict — reading the freguesia's real per-usage residual table.
export function MonteClaroSelector({
  row,
  baseTotal,
  weight,
}: {
  row: FcRow;          // Canidelo landbank row (usages + score)
  baseTotal: number;   // zone landbank total /100
  weight: number;      // valeur_meilleur_usage pillar weight
}) {
  const keys = USAGE_ORDER.filter((k) => row.usages[k]);
  const optimalKey = keys.reduce((a, b) => (row.usages[b].uplift_pct > row.usages[a].uplift_pct ? b : a), keys[0]);
  const [usage, setUsage] = useState<string>(optimalKey);
  const u = row.usages[usage];

  // Anchor on the zone's best usage: the optimal choice reproduces the zone
  // score; a sub-optimal use degrades the "valeur" pillar accordingly.
  const total = Math.max(0, Math.min(100,
    baseTotal + weight * (upliftSubscore(u.uplift_pct) - upliftSubscore(row.usages[optimalKey].uplift_pct))));
  const verdict = landbankVerdict(total);

  return (
    <div className="rounded-2xl bg-navy p-5 text-cream shadow-card fade-up">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-gold">Actif K-REST · Landbank</div>
          <div className="font-display text-lg">Monte Claro</div>
        </div>
        <VerdictBadge mode="landbank" verdict={verdict} />
      </div>

      {/* Usage selector */}
      <div className="mt-4">
        <div className="text-[12px] text-cream/60">Usage du terrain</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {keys.map((k) => {
            const on = k === usage;
            return (
              <button
                key={k}
                onClick={() => setUsage(k)}
                className={`rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors ${
                  on
                    ? "border-gold bg-gold/15 font-medium text-gold"
                    : "border-white/15 text-cream/60 hover:border-gold/40 hover:text-cream"
                }`}
              >
                {row.usages[k].label}
                {k === optimalKey && (
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${
                    on ? "bg-gold/25 text-gold" : "bg-white/10 text-cream/50"
                  }`}>
                    optimal
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric
          label="Valeur résiduelle"
          value={`${u.valeur_residuelle_eur_m2.toLocaleString("fr-FR")} €/m²`}
          sub={`réalisable ${u.prix_realisable_eur_m2.toLocaleString("fr-FR")} €/m²`}
        />
        <Metric
          label="Uplift vs marché"
          value={pctSigned(u.uplift_pct, 0)}
          sub={`foncier ${u.foncier_marche_eur_m2.toLocaleString("fr-FR")} €/m²`}
          color={scoreColor(upliftSubscore(u.uplift_pct))}
        />
        <Metric label="Score landbank" value={`${Math.round(total)}`} color={scoreColor(total)} />
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-cream/45">
        Réserve foncière de {MONTE.surface.toLocaleString("fr-FR")} m² à Canidelo. Valeur résiduelle
        et verdict recalculés en direct par usage (prix réalisable ÷ (1,15 × pile de coûts) −
        construction, marge promoteur normative 15 %).
      </p>
    </div>
  );
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="text-[10px] uppercase tracking-wide text-cream/45">{label}</div>
      <div className="font-display text-2xl leading-tight" style={{ color: color || "#F3EEE3" }}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-cream/40">{sub}</div>}
    </div>
  );
}
