"use client";

import { useState } from "react";
import { IMT_COMMERCIAL_PCT, acquisitionTaxes } from "@/lib/fiscal";

const MIN = 200_000;
const MAX = 5_000_000;
const eur = (v: number) => `${Math.round(v).toLocaleString("fr-FR")} €`;

// Live acquisition-tax simulator on the official 2026 Portuguese scales —
// neutral labelling (not a K-REST asset). The class drives the applicable IMT:
// residential = progressive "habitação secundária" table, commercial = 6,5%.
export function AcquisitionSimulator({ residential }: { residential: boolean }) {
  const [price, setPrice] = useState<number>(1_000_000);
  const t = acquisitionTaxes(price, residential);
  const pct = ((price - MIN) / (MAX - MIN)) * 100;

  return (
    <div className="rounded-2xl bg-navy p-5 text-cream shadow-card fade-up">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-gold">
            Simulateur d'acquisition · Portugal
          </div>
          <div className="font-display text-lg">Frais d'entrée {residential ? "résidentiel" : "commercial"}</div>
        </div>
        <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-medium text-gold">
          {t.pct.toFixed(1)}% du prix
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] text-cream/60">Prix d'acquisition</span>
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
        <div className="mt-1 flex justify-between text-[10px] text-cream/40">
          <span>200 000</span>
          <span>5 000 000</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric
          label="IMT"
          value={eur(t.imt)}
          sub={residential ? "barème habitação secundária" : `taux unique ${IMT_COMMERCIAL_PCT.toLocaleString("fr-FR")}%`}
        />
        <Metric label="Imposto do selo" value={eur(t.selo)} sub="0,8% du prix" />
        <Metric label="Total à l'entrée" value={eur(t.total)} sub={`${t.pct.toFixed(1)}% du prix`} color="#E0CBA0" />
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-cream/45">
        Barème IMT 2026 en vigueur (continent) : tranches marginales avec parcela a abater
        jusqu'à 660 982 €, taux uniques 6% puis 7,5% au-delà de 1 150 853 € ; prédios não
        habitacionais et terrains à bâtir au taux unique de 6,5%.
      </p>
    </div>
  );
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="text-[10px] uppercase tracking-wide text-cream/45">{label}</div>
      <div className="font-display text-xl leading-tight" style={{ color: color || "#F3EEE3" }}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-cream/40">{sub}</div>}
    </div>
  );
}
