"use client";

import { useState } from "react";
import {
  HAYA,
  hayaMargin,
  hayaPremium,
  margeSubscore,
  promotionVerdict,
  scoreTextColorDark,
} from "@/lib/scoring";
import { VerdictBadge } from "./ui";

// Live, client-side recompute: formula identical to the backend.
export function HayaSlider({ baseTotal, margeWeight }: { baseTotal: number; margeWeight: number }) {
  const [sale, setSale] = useState<number>(HAYA.baseSale);

  // Anchor on the client band at the base sale so the total lands exactly on
  // the API total when the slider sits at the base price, then moves relative.
  const baseMargeSub = margeSubscore(hayaMargin(HAYA.baseSale));
  const margin = hayaMargin(sale);
  const premium = hayaPremium(sale);
  const margeSub = margeSubscore(margin);
  const total = Math.max(0, Math.min(100, baseTotal + margeWeight * (margeSub - baseMargeSub)));
  const verdict = promotionVerdict(total);
  const pct = ((sale - HAYA.saleMin) / (HAYA.saleMax - HAYA.saleMin)) * 100;

  return (
    <div className="rounded-2xl bg-navy p-5 text-cream shadow-card fade-up">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-label font-semibold uppercase tracking-widest text-gold">Actif K-REST · Promotion</div>
          <div className="font-display text-lg">Haya Towers</div>
        </div>
        <VerdictBadge mode="promotion" verdict={verdict} />
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-label text-cream/70">Prix de vente réalisable</span>
          <span className="font-display text-xl text-gold">{Math.round(sale).toLocaleString("fr-FR")} €/m²</span>
        </div>
        <input
          type="range"
          className="haya-range mt-3 w-full"
          min={HAYA.saleMin}
          max={HAYA.saleMax}
          step={10}
          value={sale}
          onChange={(e) => setSale(Number(e.target.value))}
          style={{ ["--pct" as any]: `${pct}%` }}
        />
        <div className="mt-1 flex justify-between text-label text-cream/60">
          <span>{HAYA.saleMin.toLocaleString("fr-FR")}</span>
          <span>{HAYA.saleMax.toLocaleString("fr-FR")}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric label="Marge promoteur" value={`${margin.toFixed(0)}%`} color={scoreTextColorDark(margeSub)} />
        <Metric
          label="Prime / médiane"
          value={`+${premium.toFixed(0)}%`}
          sub={`médiane ${HAYA.freguesiaMedian.toLocaleString("fr-FR")} €/m²`}
        />
        <Metric label="Score promotion" value={`${Math.round(total)}`} color={scoreTextColorDark(total)} />
      </div>

      <p className="mt-4 text-caption leading-relaxed text-cream/85">
        Prix neuf réalisable vs médiane réelle de la freguesia. Marge et verdict recalculés en direct
        (coût = 1,261 × (construction + foncier), marge = (prix de vente − coût) / coût).
      </p>
    </div>
  );
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="text-label uppercase tracking-wide text-cream/70">{label}</div>
      <div className="font-display text-2xl leading-tight" style={{ color: color || "#F8F5EE" }}>
        {value}
      </div>
      {sub && <div className="text-label text-cream/85">{sub}</div>}
    </div>
  );
}
