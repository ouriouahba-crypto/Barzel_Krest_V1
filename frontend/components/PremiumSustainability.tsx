"use client";

import type { SustainabilityDriver } from "@/lib/premium";
import { useT } from "@/lib/i18n/useT";

// Soutenabilite du premium : parts structurelle et conjoncturelle, puis deux
// colonnes de drivers avec barres CSS (or = structurel, muted = conjoncturel).
// La distinction de couleur porte le message : un premium adosse a du
// conjoncturel est plus fragile. Pas de Recharts, barres CSS pures.

export function PremiumSustainability({
  drivers,
  structuralShare,
  cyclicalShare,
}: {
  drivers: SustainabilityDriver[];
  structuralShare: number;
  cyclicalShare: number;
}) {
  const t = useT();
  const structural = drivers
    .filter((d) => d.nature === "structural")
    .sort((a, b) => b.weight - a.weight);
  const cyclical = drivers
    .filter((d) => d.nature === "cyclical")
    .sort((a, b) => b.weight - a.weight);

  return (
    <div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-label uppercase tracking-widest text-muted">
            {t("pr.nature.structuralShare")}
          </div>
          <div className="font-display text-kpi text-navy tabular-nums">{structuralShare}%</div>
        </div>
        <div>
          <div className="text-label uppercase tracking-widest text-muted">
            {t("pr.nature.cyclicalShare")}
          </div>
          <div className="font-display text-kpi text-navy tabular-nums">{cyclicalShare}%</div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        <DriverColumn title={t("pr.nature.structural")} drivers={structural} barClass="bg-gold" />
        <DriverColumn title={t("pr.nature.cyclical")} drivers={cyclical} barClass="bg-muted" />
      </div>
    </div>
  );
}

function DriverColumn({
  title,
  drivers,
  barClass,
}: {
  title: string;
  drivers: SustainabilityDriver[];
  barClass: string;
}) {
  const t = useT();
  return (
    <div>
      <div className="mb-2 text-th font-medium text-navy">{title}</div>
      <div className="flex flex-col gap-2">
        {drivers.map((d) => (
          <div key={d.key}>
            <div className="flex items-baseline justify-between">
              <span className="text-td text-ink-soft">{t("pr.driver." + d.key)}</span>
              <span className="text-label tabular-nums text-muted">{d.weight}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-navy/10">
              <div className={`h-1.5 rounded-full ${barClass}`} style={{ width: `${d.weight}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
