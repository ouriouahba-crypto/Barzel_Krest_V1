"use client";

import { useState } from "react";
import {
  FABRICA,
  fabricaMargin,
  fabricaPremium,
  fmtSigned,
  margeSubscore,
  promotionVerdict,
  roundHalfUp,
  scoreTextColorDark,
} from "@/lib/scoring";
import { VerdictBadge } from "./ui";

// Recalcul live côté client, formule identique au moteur (miroir de HayaSlider,
// composant distinct : Haya reste strictement intouché). Actif Formoso (constante
// interne FABRICA inchangée) : reconversion d'un entrepôt viticole à Marvila ;
// seul le prix de sortie bouge avec le curseur.
export function FabricaSlider({ baseTotal, margeWeight }: { baseTotal: number; margeWeight: number }) {
  const [sale, setSale] = useState<number>(FABRICA.baseSale);

  const baseMargeSub = margeSubscore(fabricaMargin(FABRICA.baseSale));
  const margin = fabricaMargin(sale);
  const premium = fabricaPremium(sale);
  const margeSub = margeSubscore(margin);
  const total = Math.max(0, Math.min(100, baseTotal + margeWeight * (margeSub - baseMargeSub)));
  const verdict = promotionVerdict(total);
  // Clamp d'AFFICHAGE seulement (artefact de frontière) : entre 5570 et 5580 le
  // total brut (~69,8) s'arrondit à 70 alors que le verdict reste Conditionnel
  // (< 70). On plafonne le score affiché sous 70 tant que le verdict n'est pas
  // Go, pour ne pas contredire le badge. Le badge, lui, reste calculé sur le
  // total brut (déjà correct) ; aucune constante FABRICA ni marge touchée.
  const s = roundHalfUp(total); // chemin d'arrondi unique (helper half-up)
  const scoreAffiche = verdict === "Go" ? s : Math.min(s, 69);
  const pct = ((sale - FABRICA.saleMin) / (FABRICA.saleMax - FABRICA.saleMin)) * 100;

  return (
    <div className="rounded-2xl bg-navy p-5 text-cream shadow-card fade-up">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-label font-semibold uppercase tracking-widest text-gold">Actif K-REST · Promotion</div>
          <div className="font-display text-lg">Formoso</div>
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
          min={FABRICA.saleMin}
          max={FABRICA.saleMax}
          step={10}
          value={sale}
          onChange={(e) => setSale(Number(e.target.value))}
          style={{ ["--pct" as any]: `${pct}%` }}
        />
        <div className="mt-1 flex justify-between text-label text-cream/60">
          <span>{FABRICA.saleMin.toLocaleString("fr-FR")}</span>
          <span>{FABRICA.saleMax.toLocaleString("fr-FR")}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric label="Marge promoteur" value={`${margin.toFixed(0)}%`} color={scoreTextColorDark(margeSub)} />
        <Metric
          label="Prime / médiane"
          value={`${fmtSigned(premium)}%`}
          sub={`médiane ${FABRICA.freguesiaMedian.toLocaleString("fr-FR")} €/m²`}
        />
        <Metric label="Score promotion" value={`${scoreAffiche}`} color={scoreTextColorDark(total)} />
      </div>

      <p className="mt-4 text-caption leading-relaxed text-cream/85">
        Reconversion d'un entrepôt viticole à Marvila, arc oriental : 50 appartements T1 et T2 duplex signés
        Bak Gordon (livraison 2026-2027), coque conservée + finitions {FABRICA.construction.toLocaleString("fr-FR")} €/m²,
        foncier {FABRICA.foncier.toLocaleString("fr-FR")} €/m².
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
