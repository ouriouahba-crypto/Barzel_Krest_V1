"use client";

import { useState } from "react";
import { IMT_COMMERCIAL_PCT, acquisitionTaxes } from "@/lib/fiscal";
import { useT } from "@/lib/i18n/useT";

const MIN = 200_000;
const MAX = 5_000_000;
const eur = (v: number) => `${Math.round(v).toLocaleString("fr-FR")} €`;

// Live acquisition-tax simulator on the official 2026 Portuguese scales,
// neutral labelling (not a K-REST asset). The class drives the applicable IMT:
// residential = progressive "habitação secundária" table, commercial = 6,5%.
export function AcquisitionSimulator({ residential }: { residential: boolean }) {
  const tr = useT();
  const [price, setPrice] = useState<number>(1_000_000);
  const t = acquisitionTaxes(price, residential);
  const pct = ((price - MIN) / (MAX - MIN)) * 100;

  return (
    <div className="rounded-2xl bg-navy p-5 text-cream shadow-card fade-up">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-label font-semibold uppercase tracking-widest text-gold">
            {tr("wg.acquisitionSimulator")}
          </div>
          <div className="font-display text-lg">{residential ? tr("wg.entryFeesResidential") : tr("wg.entryFeesCommercial")}</div>
        </div>
        <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-label font-medium text-gold">
          {t.pct.toFixed(1)}% {tr("wg.ofPrice")}
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-label text-cream/70">{tr("wg.acquisitionPrice")}</span>
          <span className="font-display text-xl text-gold">{eur(price)}</span>
        </div>
        <input
          type="range"
          className="haya-range mt-3 w-full"
          min={MIN}
          max={MAX}
          step={10_000}
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
          style={{ ["--pct" as any]: `${pct}%` }}
        />
        <div className="mt-1 flex justify-between text-label text-cream/60">
          <span>200 000</span>
          <span>5 000 000</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric
          label={tr("wg.imt")}
          value={eur(t.imt)}
          sub={residential ? tr("wg.imtResidentialScale") : tr("wg.singleRate", { v: IMT_COMMERCIAL_PCT.toLocaleString("fr-FR") })}
        />
        <Metric label={tr("wg.impostoSelo")} value={eur(t.selo)} sub={`0,8% ${tr("wg.ofPrice")}`} />
        <Metric label={tr("wg.totalAtEntry")} value={eur(t.total)} sub={`${t.pct.toFixed(1)}% ${tr("wg.ofPrice")}`} color="#E0CBA0" />
      </div>

      <p className="mt-4 text-caption leading-relaxed text-cream/85">
        {tr("wg.acquisitionCaption")}
      </p>
    </div>
  );
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="text-label uppercase tracking-wide text-cream/70">{label}</div>
      <div className="font-display text-xl leading-tight" style={{ color: color || "#F8F5EE" }}>
        {value}
      </div>
      {sub && <div className="text-label text-cream/85">{sub}</div>}
    </div>
  );
}
