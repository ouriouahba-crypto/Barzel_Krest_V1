"use client";

import { useState } from "react";
import {
  DANSAERT,
  dansaertMargin,
  dansaertPremium,
  fmtSigned,
  margeSubscore,
  promotionVerdict,
  roundHalfUp,
  scoreTextColorDark,
} from "@/lib/scoring";
import { VerdictBadge } from "./ui";

// Recalcul live côté client, formule identique au moteur (composant distinct :
// Haya et Fábrica restent strictement intouchés). Conversion d'un immeuble de
// bureaux vacant en résidentiel, quartier du canal / Dansaert (Molenbeek) ;
// seul le prix de sortie bouge avec le curseur. Résidentiel neuf BE : TVA 21%
// assujettie (le prix de sortie est net de TVA avant la marge).
export function DansaertSlider({ baseTotal, margeWeight }: { baseTotal: number; margeWeight: number }) {
  const [sale, setSale] = useState<number>(DANSAERT.baseSale);

  const baseMargeSub = margeSubscore(dansaertMargin(DANSAERT.baseSale));
  const margin = dansaertMargin(sale);
  const premium = dansaertPremium(sale);
  const margeSub = margeSubscore(margin);
  const total = Math.max(0, Math.min(100, baseTotal + margeWeight * (margeSub - baseMargeSub)));

  // Verdict = échelle promotion + garde-fou de marge (marge < 0 -> Passer ;
  // marge sous le hurdle rate projet -> plafond Conditionnel : une bonne
  // localisation ne rachète pas une économie qui ne tient pas). Le feu vert du
  // développement exige une marge conventionnelle (DANSAERT.goMarginFloorPct =
  // 12%, prix ~3980 €/m²), plus exigeant que le cap de marché de la commune ;
  // c'est une calibration de la couche actif, jamais un offset en points.
  let verdict = promotionVerdict(total);
  if (margin < 0) verdict = "Passer";
  else if (margin < DANSAERT.goMarginFloorPct && verdict === "Go") verdict = "Conditionnel";

  // Clamp d'AFFICHAGE seulement : tant que le verdict n'est pas Go (marge sous
  // le seuil), on plafonne le score affiché sous 70 pour ne pas contredire le
  // badge. Le badge et la calibration restent calculés sur le total brut.
  const s = roundHalfUp(total); // chemin d'arrondi unique (helper half-up)
  const scoreAffiche = verdict === "Go" ? s : Math.min(s, 69);
  const pct = ((sale - DANSAERT.saleMin) / (DANSAERT.saleMax - DANSAERT.saleMin)) * 100;

  return (
    <div className="rounded-2xl bg-navy p-5 text-cream shadow-card fade-up">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-label font-semibold uppercase tracking-widest text-gold">Actif K-REST · Promotion</div>
          <div className="font-display text-lg">Dansaert Quai</div>
        </div>
        <VerdictBadge mode="promotion" verdict={verdict} />
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-label text-cream/70">Prix de sortie visé</span>
          <span className="font-display text-xl text-gold">{Math.round(sale).toLocaleString("fr-FR")} €/m²</span>
        </div>
        <input
          type="range"
          className="haya-range mt-3 w-full"
          min={DANSAERT.saleMin}
          max={DANSAERT.saleMax}
          step={10}
          value={sale}
          onChange={(e) => setSale(Number(e.target.value))}
          style={{ ["--pct" as any]: `${pct}%` }}
        />
        <div className="mt-1 flex justify-between text-label text-cream/60">
          <span>{DANSAERT.saleMin.toLocaleString("fr-FR")}</span>
          <span>{DANSAERT.saleMax.toLocaleString("fr-FR")}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric label="Marge promoteur" value={`${margin.toFixed(0)}%`} color={scoreTextColorDark(margeSub)} />
        <Metric
          label="Prime / médiane"
          value={`${fmtSigned(premium)}%`}
          sub={`médiane ${DANSAERT.communeMedian.toLocaleString("fr-FR")} €/m²`}
        />
        <Metric label="Score promotion" value={`${scoreAffiche}`} color={scoreTextColorDark(total)} />
      </div>

      <p className="mt-4 text-caption leading-relaxed text-cream/85">
        Conversion d'un immeuble de bureaux vacant en résidentiel, quartier du canal (Dansaert) :
        {" "}{DANSAERT.surface.toLocaleString("fr-FR")} m² constructibles, coque conservée,
        conversion {DANSAERT.construction.toLocaleString("fr-FR")} €/m², foncier au prix bureau {DANSAERT.foncier.toLocaleString("fr-FR")} €/m².
        Marge et verdict recalculés en direct (coût = 1,261 × (conversion + foncier) ; résidentiel neuf BE
        soumis à la TVA 21% sur le prix de sortie, pas de droits d'enregistrement sur le neuf).
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
