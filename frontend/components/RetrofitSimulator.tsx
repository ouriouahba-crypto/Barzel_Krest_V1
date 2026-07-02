"use client";

import { useState } from "react";
import { RdRow } from "@/lib/rendement";
import { SCE_SCALE, SceGrade, capexPerM2, retrofitImpact } from "@/lib/energie";

const CURRENT: SceGrade[] = ["F", "E", "D"];
const TARGET: SceGrade[] = ["D", "C", "B"];

// Live retrofit simulator — neutral labelling. Picks a current and a target SCE
// class (Portuguese scale, A+ → F), shows the estimated CAPEX per m² and its
// impact on the net yield of a typical Santa Marinha asset (CAPEX added to the
// value base, rent unchanged).
export function RetrofitSimulator({ row }: { row: RdRow }) {
  const [from, setFrom] = useState<SceGrade>("F");
  const [to, setTo] = useState<SceGrade>("C");

  const rank = (g: SceGrade) => SCE_SCALE.indexOf(g);
  const capex = capexPerM2(from, to);
  const impact = capex != null ? retrofitImpact(row, capex) : null;

  const pick = (g: SceGrade, kind: "from" | "to") => {
    if (kind === "from") {
      setFrom(g);
      if (rank(to) <= rank(g)) setTo(TARGET.find((t) => rank(t) > rank(g)) ?? "B");
    } else {
      setTo(g);
    }
  };

  return (
    <div className="rounded-2xl bg-navy p-5 text-cream shadow-card fade-up">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-gold">
            Simulateur de mise à niveau · Énergie
          </div>
          <div className="font-display text-lg">Rénovation énergétique (SCE)</div>
        </div>
        {capex != null && (
          <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-medium text-gold">
            {from} → {to}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <div className="text-[12px] text-cream/60">Classe actuelle</div>
          <div className="mt-2 flex gap-1.5">
            {CURRENT.map((g) => (
              <Chip key={g} label={g} on={g === from} onClick={() => pick(g, "from")} />
            ))}
          </div>
        </div>
        <div>
          <div className="text-[12px] text-cream/60">Classe cible</div>
          <div className="mt-2 flex gap-1.5">
            {TARGET.map((g) => (
              <Chip key={g} label={g} on={g === to} disabled={rank(g) <= rank(from)} onClick={() => pick(g, "to")} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric
          label="CAPEX estimé"
          value={capex != null ? `~${capex} €/m²` : "—"}
          sub="isolation, menuiseries, PAC"
        />
        <Metric
          label="Yield net après"
          value={impact ? `${impact.netAfter.toFixed(2)}%` : "—"}
          sub={impact ? `avant ${impact.netBefore.toFixed(2)}%` : undefined}
        />
        <Metric
          label="Compression"
          value={impact ? `−${impact.compression.toFixed(2)} pt` : "—"}
          sub="première décennie"
          color="#E0CBA0"
        />
      </div>

      {capex != null && impact && (
        <p className="mt-4 text-[11px] leading-relaxed text-cream/45">
          La mise à niveau {from}→{to} coûte ~{capex} €/m² et comprime le yield net de{" "}
          {impact.compression.toFixed(2).replace(".", ",")} point la première décennie — loyer
          inchangé, actif type Santa Marinha ({Math.round(impact.value).toLocaleString("fr-FR")} €/m²).
        </p>
      )}
    </div>
  );
}

function Chip({ label, on, disabled, onClick }: { label: string; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-w-[42px] rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${
        on
          ? "border-gold bg-gold/15 text-gold"
          : disabled
          ? "cursor-not-allowed border-white/10 text-cream/25"
          : "border-white/15 text-cream/60 hover:border-gold/40 hover:text-cream"
      }`}
    >
      {label}
    </button>
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
