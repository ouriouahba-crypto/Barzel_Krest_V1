"use client";

import { useState } from "react";
import { RdRow } from "@/lib/rendement";
import { SCE_SCALE, SceGrade, capexPerM2, retrofitImpact } from "@/lib/energie";
import { useT, useLang } from "@/lib/i18n/useT";
import { fmtNumber } from "@/lib/i18n/format";

const CURRENT: SceGrade[] = ["F", "E", "D"];
const TARGET: SceGrade[] = ["D", "C", "B"];

// Live retrofit simulator, neutral labelling. Picks a current and a target SCE
// class (Portuguese scale, A+ → F), shows the estimated CAPEX per m² and its
// impact on the net yield of a typical asset of the given freguesia (CAPEX
// added to the value base, rent unchanged). The header selector drives which
// freguesia feeds it; defaults to Santa Marinha.
export function RetrofitSimulator({ row, placeLabel, efShare }: { row: RdRow; placeLabel: string; efShare: number | null }) {
  const tr = useT();
  const lang = useLang();
  const [from, setFrom] = useState<SceGrade>("F");
  const [to, setTo] = useState<SceGrade>("C");

  const rank = (g: SceGrade) => SCE_SCALE.indexOf(g);
  const capex = capexPerM2(from, to);
  const impact = capex != null ? retrofitImpact(row, capex) : null;
  // Valeur « actif type » = médiane de marché dynamique de la freguesia choisie
  // (même base que retrofitImpact), repli sur la valeur loyer / rendement brut.
  const value = row.median && row.median > 0 ? row.median : row.loyer && row.yieldBrut > 0 ? row.loyer / (row.yieldBrut / 100) : null;

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
          <div className="text-label font-semibold uppercase tracking-widest text-gold">
            {tr("wg.retrofitSimulator")}
          </div>
          <div className="font-display text-lg">{tr("wg.energyRetrofit")}</div>
          <div className="mt-0.5 text-caption text-cream/85">
            {tr("wg.typicalAssetAt", { place: placeLabel })}
            {value != null ? ` · ${fmtNumber(Math.round(value), lang)} €/m²` : ""}
            {efShare != null ? ` · ${tr("wg.efStock")} ${efShare}%` : ""}
          </div>
        </div>
        {capex != null && (
          <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-label font-medium text-gold">
            {from} → {to}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <div className="text-label text-cream/70">{tr("wg.currentClass")}</div>
          <div className="mt-2 flex gap-1.5">
            {CURRENT.map((g) => (
              <Chip key={g} label={g} on={g === from} onClick={() => pick(g, "from")} />
            ))}
          </div>
        </div>
        <div>
          <div className="text-label text-cream/70">{tr("wg.targetClass")}</div>
          <div className="mt-2 flex gap-1.5">
            {TARGET.map((g) => (
              <Chip key={g} label={g} on={g === to} disabled={rank(g) <= rank(from)} onClick={() => pick(g, "to")} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric
          label={tr("wg.estimatedCapex")}
          value={capex != null ? `~${capex} €/m²` : "–"}
          sub={tr("wg.retrofitScope")}
        />
        <Metric
          label={tr("wg.netYieldAfter")}
          value={impact ? `${impact.netAfter.toFixed(2)}%` : "–"}
          sub={impact ? `${tr("wg.before")} ${impact.netBefore.toFixed(2)}%` : undefined}
        />
        <Metric
          label={tr("wg.compression")}
          value={impact ? `−${impact.compression.toFixed(2)} pt` : "–"}
          sub={tr("wg.firstDecade")}
          color="#E0CBA0"
        />
      </div>

      {capex != null && impact && (
        <p className="mt-4 text-caption leading-relaxed text-cream/85">
          {tr("wg.retrofitCaption", {
            from,
            to,
            capex,
            compression: impact.compression.toFixed(2).replace(".", ","),
            place: placeLabel,
            value: fmtNumber(Math.round(value ?? impact.value), lang),
          })}
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
      className={`min-w-[42px] rounded-lg border px-3 py-1.5 text-btn font-medium transition-colors ${
        on
          ? "border-gold bg-gold/15 text-gold"
          : disabled
          ? "cursor-not-allowed border-white/10 text-cream/30"
          : "border-white/15 text-cream/70 hover:border-gold/40 hover:text-cream"
      }`}
    >
      {label}
    </button>
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
