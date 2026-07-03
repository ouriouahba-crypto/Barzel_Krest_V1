"use client";

import { useState } from "react";
import { CAIS, arbitrageVerdict, scoreTextColorDark, spreadSubscore } from "@/lib/scoring";
import { ArbRow, pctSigned } from "@/lib/arbitrage";
import { VerdictBadge } from "./ui";

// Live, client-side recompute for the K-REST arbitrage asset (Cais Poente,
// actif trophée front de fleuve à Santa Marinha). Market data (médiane Gaia,
// valeur réalisable, rotation de la zone) is read from the freguesia row;
// only the asking price moves with the slider.
export function CaisSlider({
  row,
  baseTotal,
  weight,
}: {
  row: ArbRow;         // Santa Marinha arbitrage row (médiane, réalisable, délai)
  baseTotal: number;   // zone arbitrage total /100
  weight: number;      // spread pillar weight
}) {
  const [price, setPrice] = useState<number>(CAIS.priceDefault);

  const spread = row.prixMarche ? (price / row.prixMarche - 1) * 100 : 0;
  // Asking above the zone's realizable value stretches the disposal time.
  const delai =
    row.delaiMois != null && row.valeurRealisable
      ? Math.min(9, Math.max(2, row.delaiMois * Math.pow(price / row.valeurRealisable, CAIS.delayExp)))
      : null;
  // Anchor on the zone's own spread: the total moves as if the zone's spread
  // pillar were replaced by the asset's.
  const total = Math.max(0, Math.min(100, baseTotal + weight * (spreadSubscore(spread) - spreadSubscore(row.spreadPct))));
  const verdict = arbitrageVerdict(total);
  const pct = ((price - CAIS.priceMin) / (CAIS.priceMax - CAIS.priceMin)) * 100;

  return (
    <div className="rounded-2xl bg-navy p-5 text-cream shadow-card fade-up">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-label font-semibold uppercase tracking-widest text-gold">Actif K-REST · Arbitrage</div>
          <div className="font-display text-lg">Cais Poente</div>
        </div>
        <VerdictBadge mode="arbitrage" verdict={verdict} />
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-label text-cream/70">Prix de cession visé</span>
          <span className="font-display text-xl text-gold">{Math.round(price).toLocaleString("fr-FR")} €/m²</span>
        </div>
        <input
          type="range"
          className="haya-range mt-3 w-full"
          min={CAIS.priceMin}
          max={CAIS.priceMax}
          step={10}
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
          style={{ ["--pct" as any]: `${pct}%` }}
        />
        <div className="mt-1 flex justify-between text-label text-cream/60">
          <span>{CAIS.priceMin.toLocaleString("fr-FR")}</span>
          <span>{CAIS.priceMax.toLocaleString("fr-FR")}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric
          label="Spread"
          value={pctSigned(spread, 0)}
          sub={row.prixMarche ? `médiane ${row.prixMarche.toLocaleString("fr-FR")} €/m²` : undefined}
          color={scoreTextColorDark(spreadSubscore(spread))}
        />
        <Metric
          label="Délai estimé"
          value={delai != null ? `${delai.toFixed(1)} mois` : "—"}
          sub={row.valeurRealisable ? `réalisable ${row.valeurRealisable.toLocaleString("fr-FR")} €/m²` : undefined}
        />
        <Metric label="Score arbitrage" value={`${Math.round(total)}`} color={scoreTextColorDark(total)} />
      </div>

      <p className="mt-4 text-caption leading-relaxed text-cream/85">
        Actif trophée front de fleuve à Santa Marinha. Spread vs médiane Gaia et délai croissant
        avec le prix demandé (dérivé de la rotation de la zone) ; verdict fenêtre recalculé en direct.
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
