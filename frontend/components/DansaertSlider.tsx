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
import { useT, useLang } from "@/lib/i18n/useT";
import { fmtNumber } from "@/lib/i18n/format";

// Recalcul live côté client, formule identique au moteur (composant distinct :
// Haya et Formoso restent strictement intouchés). Conversion d'un immeuble de
// bureaux vacant en résidentiel, quartier du canal / Dansaert (Molenbeek) ;
// seul le prix de sortie bouge avec le curseur. Résidentiel neuf BE : TVA 21%
// assujettie (le prix de sortie est net de TVA avant la marge).
export function DansaertSlider({ baseTotal, margeWeight }: { baseTotal: number; margeWeight: number }) {
  const t = useT();
  const lang = useLang();
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
          <div className="text-label font-semibold uppercase tracking-widest text-gold">{t("wg.assetPromotion")}</div>
          <div className="font-display text-lg">Dansaert Quai</div>
        </div>
        <VerdictBadge mode="promotion" verdict={verdict} />
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-label text-cream/70">{t("wg.targetSalePrice")}</span>
          <span className="font-display text-xl text-gold">{fmtNumber(Math.round(sale), lang)} €/m²</span>
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
          <span>{fmtNumber(DANSAERT.saleMin, lang)}</span>
          <span>{fmtNumber(DANSAERT.saleMax, lang)}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric label={t("wg.developerMargin")} value={`${margin.toFixed(0)}%`} color={scoreTextColorDark(margeSub)} />
        <Metric
          label={t("wg.premiumVsMedian")}
          value={`${fmtSigned(premium)}%`}
          sub={t("wg.medianEurM2", { v: fmtNumber(DANSAERT.communeMedian, lang) })}
        />
        <Metric label={t("wg.scorePromotion")} value={`${scoreAffiche}`} color={scoreTextColorDark(total)} />
      </div>

      <p className="mt-4 text-caption leading-relaxed text-cream/85">
        {t("wg.dansaertCaption", {
          surface: fmtNumber(DANSAERT.surface, lang),
          construction: fmtNumber(DANSAERT.construction, lang),
          foncier: fmtNumber(DANSAERT.foncier, lang),
        })}
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
