"use client";

import { useState } from "react";
import {
  CAMPANHA,
  campanhaMargin,
  campanhaPremium,
  fmtSigned,
  margeSubscore,
  promotionVerdict,
  roundHalfUp,
  scoreTextColorDark,
} from "@/lib/scoring";
import { VerdictBadge } from "./ui";

// Recalcul live cote client, formule identique au moteur (composant distinct :
// Haya, Fabrica et Dansaert restent strictement intouches). Projet mixte
// (logement, bureaux, hotel) signe Eduardo Souto de Moura a Campanha, ancre sur
// sa composante RESIDENTIELLE ; seul le prix de sortie bouge avec le curseur.
// Residentiel PT : PAS de TVA deduite du prix de sortie (IMT cote acquereur),
// contrairement au neuf BE.
export function CampanhaSlider({ baseTotal, margeWeight }: { baseTotal: number; margeWeight: number }) {
  const [sale, setSale] = useState<number>(CAMPANHA.baseSale);

  const baseMargeSub = margeSubscore(campanhaMargin(CAMPANHA.baseSale));
  const margin = campanhaMargin(sale);
  const premium = campanhaPremium(sale);
  const margeSub = margeSubscore(margin);
  const total = Math.max(0, Math.min(100, baseTotal + margeWeight * (margeSub - baseMargeSub)));

  // Verdict = echelle promotion + garde-fou de marge (marge < 0 -> Passer ;
  // marge sous le hurdle rate projet -> plafond Conditionnel). Le feu vert du
  // developpement exige une marge conventionnelle (CAMPANHA.goMarginFloorPct =
  // 12%, prix ~3686 €/m²), plus exigeant que le cap de marche 8% de la commune ;
  // c'est une calibration de la couche actif, jamais un offset en points.
  let verdict = promotionVerdict(total);
  if (margin < 0) verdict = "Passer";
  else if (margin < CAMPANHA.goMarginFloorPct && verdict === "Go") verdict = "Conditionnel";

  // Clamp d'AFFICHAGE seulement : tant que le verdict n'est pas Go (marge sous
  // le seuil), on plafonne le score affiche sous 70 pour ne pas contredire le
  // badge. Le badge et la calibration restent calcules sur le total brut (meme
  // correctif que Fabrica et Dansaert).
  const s = roundHalfUp(total); // chemin d'arrondi unique (helper half-up)
  const scoreAffiche = verdict === "Go" ? s : Math.min(s, 69);
  const pct = ((sale - CAMPANHA.saleMin) / (CAMPANHA.saleMax - CAMPANHA.saleMin)) * 100;

  return (
    <div className="rounded-2xl bg-navy p-5 text-cream shadow-card fade-up">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-label font-semibold uppercase tracking-widest text-gold">Actif K-REST · Promotion</div>
          <div className="font-display text-lg">Campanha Souto de Moura</div>
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
          min={CAMPANHA.saleMin}
          max={CAMPANHA.saleMax}
          step={10}
          value={sale}
          onChange={(e) => setSale(Number(e.target.value))}
          style={{ ["--pct" as any]: `${pct}%` }}
        />
        <div className="mt-1 flex justify-between text-label text-cream/60">
          <span>{CAMPANHA.saleMin.toLocaleString("fr-FR")}</span>
          <span>{CAMPANHA.saleMax.toLocaleString("fr-FR")}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric label="Marge promoteur" value={`${margin.toFixed(0)}%`} color={scoreTextColorDark(margeSub)} />
        <Metric
          label="Prime / médiane"
          value={`${fmtSigned(premium)}%`}
          sub={`médiane ${CAMPANHA.freguesiaMedian.toLocaleString("fr-FR")} €/m²`}
        />
        <Metric label="Score promotion" value={`${scoreAffiche}`} color={scoreTextColorDark(total)} />
      </div>

      <p className="mt-4 text-caption leading-relaxed text-cream/85">
        Projet mixte (logement, bureaux, hôtel) signé Eduardo Souto de Moura à Campanhã, arc de régénération est :
        {" "}{CAMPANHA.surface.toLocaleString("fr-FR")} m² constructibles, composante résidentielle prédominante,
        construction {CAMPANHA.construction.toLocaleString("fr-FR")} €/m², foncier au prix Campanhã {CAMPANHA.foncier.toLocaleString("fr-FR")} €/m².
        Marge et verdict recalculés en direct (coût = 1,261 × (construction + foncier) ; résidentiel PT sans TVA
        sur le prix de sortie, IMT côté acquéreur).
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
