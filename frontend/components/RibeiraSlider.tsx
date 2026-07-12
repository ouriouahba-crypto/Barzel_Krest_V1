"use client";

import { useState } from "react";
import { RIBEIRA, detentionVerdict, fmtSigned, scoreTextColorDark, yieldNetSubscore } from "@/lib/scoring";
import { RdRow } from "@/lib/rendement";
import { VerdictBadge } from "./ui";
import { useT, useLang } from "@/lib/i18n/useT";
import { fmtNumber } from "@/lib/i18n/format";

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
  const t = useT();
  const lang = useLang();
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
          <div className="text-label font-semibold uppercase tracking-widest text-gold">{t("wg.assetDetention")}</div>
          <div className="font-display text-lg">Ribeira Sul</div>
        </div>
        <VerdictBadge mode="detention" verdict={verdict} />
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-label text-cream/70">{t("wg.avgRent")}</span>
          <span className="font-display text-xl text-gold">
            {fmtNumber(rent, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} {t("u.eurM2Month")}
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
          <span>{fmtNumber(RIBEIRA.rentMin, lang)}</span>
          <span>{fmtNumber(RIBEIRA.rentMax, lang)}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric label={t("wg.netYield")} value={`${net.toFixed(2)}%`} color={scoreTextColorDark(yieldNetSubscore(net))} />
        <Metric
          label={t("wg.rentVsMarket")}
          value={vsMarket != null ? `${fmtSigned(vsMarket)}%` : "–"}
          sub={row.loyer ? t("wg.marketEurM2Year", { v: fmtNumber(row.loyer, lang) }) : undefined}
        />
        <Metric label={t("wg.scoreDetention")} value={`${Math.round(total)}`} color={scoreTextColorDark(total)} />
      </div>

      <p className="mt-4 text-caption leading-relaxed text-cream/85">
        {t("wg.ribeiraCaption", {
          lots: RIBEIRA.lots,
          surface: fmtNumber(RIBEIRA.surface, lang),
          acquisition: fmtNumber(RIBEIRA.acquisition, lang),
          travaux: RIBEIRA.travaux,
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
