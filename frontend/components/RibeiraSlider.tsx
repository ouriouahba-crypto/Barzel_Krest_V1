"use client";

import { useState } from "react";
import { RIBEIRA, detentionVerdict, scoreTextColorDark, yieldNetSubscore } from "@/lib/scoring";
import { RdRow } from "@/lib/rendement";
import { VerdictBadge } from "./ui";

// Live, client-side recompute for the K-REST détention asset (Ribeira Sul,
// immeuble de rapport à Santa Marinha). Market data (charges/fiscalité rates,
// market rent, zone yield) is read from the freguesia row so the asset stays
// aligned with the zone; only the average rent moves with the slider.
export function RibeiraSlider({
  row,
  baseTotal,
  weight,
}: {
  row: RdRow;          // Santa Marinha détention row (rates + market rent)
  baseTotal: number;   // zone détention total /100
  weight: number;      // rendement_net pillar weight
}) {
  const [rent, setRent] = useState<number>(RIBEIRA.rentDefault);

  // Identity brut × (1 − charges − fiscalité) = net, with the freguesia's rates.
  const factor = 1 - (row.chargesPctLoyer + row.fiscPctLoyer) / 100;
  const brut = ((rent * 12) / RIBEIRA.base) * 100;
  const net = brut * factor;
  // Anchor on the zone's own net yield: the total moves as if the zone's
  // rendement pillar were replaced by the asset's.
  const total = Math.max(0, Math.min(100, baseTotal + weight * (yieldNetSubscore(net) - yieldNetSubscore(row.yieldNet))));
  const verdict = detentionVerdict(total);
  const vsMarket = row.loyer ? ((rent * 12) / row.loyer - 1) * 100 : null;
  const pct = ((rent - RIBEIRA.rentMin) / (RIBEIRA.rentMax - RIBEIRA.rentMin)) * 100;

  return (
    <div className="rounded-2xl bg-navy p-5 text-cream shadow-card fade-up">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-label font-semibold uppercase tracking-widest text-gold">Actif K-REST · Détention</div>
          <div className="font-display text-lg">Ribeira Sul</div>
        </div>
        <VerdictBadge mode="detention" verdict={verdict} />
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-label text-cream/70">Loyer moyen</span>
          <span className="font-display text-xl text-gold">
            {rent.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} €/m²/mois
          </span>
        </div>
        <input
          type="range"
          className="haya-range mt-3 w-full"
          min={RIBEIRA.rentMin}
          max={RIBEIRA.rentMax}
          step={0.1}
          value={rent}
          onChange={(e) => setRent(Number(e.target.value))}
          style={{ ["--pct" as any]: `${pct}%` }}
        />
        <div className="mt-1 flex justify-between text-label text-cream/60">
          <span>{RIBEIRA.rentMin.toLocaleString("fr-FR")}</span>
          <span>{RIBEIRA.rentMax.toLocaleString("fr-FR")}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric label="Yield net" value={`${net.toFixed(2)}%`} color={scoreTextColorDark(yieldNetSubscore(net))} />
        <Metric
          label="Loyer vs marché"
          value={vsMarket != null ? `${vsMarket >= 0 ? "+" : ""}${vsMarket.toFixed(0)}%` : "—"}
          sub={row.loyer ? `marché ${row.loyer.toLocaleString("fr-FR")} €/m²/an` : undefined}
        />
        <Metric label="Score détention" value={`${Math.round(total)}`} color={scoreTextColorDark(total)} />
      </div>

      <p className="mt-4 text-caption leading-relaxed text-cream/85">
        Immeuble de rapport à Santa Marinha — {RIBEIRA.lots} lots, {RIBEIRA.surface.toLocaleString("fr-FR")} m²,
        acquis {RIBEIRA.acquisition.toLocaleString("fr-FR")} €/m² + {RIBEIRA.travaux} €/m² de travaux.
        Yield et verdict recalculés en direct (net = brut × (1 − charges − fiscalité), taux de la freguesia).
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
