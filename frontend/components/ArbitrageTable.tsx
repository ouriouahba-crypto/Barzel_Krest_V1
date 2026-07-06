"use client";

import { useMemo, useState } from "react";
import { Mode, scoreColor, verdictTextColor, verdictTone } from "@/lib/scoring";
import { eur0 } from "@/lib/priceMargin";
import { ArbRow, pctSigned } from "@/lib/arbitrage";
import { VerdictBadge } from "./ui";
import { useZoneNoun } from "@/lib/useZoneNoun";

// Arbitrage table: same visual codes as the other mode tables. Default:
// open/narrow windows above a "Fenêtre fermée" separator, best score first in
// each group; any user sort goes global (no separator, arrow lights up).

// "Prix marché" (la médiane ville, constante) et "Appétit" (constant par classe,
// déjà dans les KPI) ne sont pas des colonnes : la médiane reste citée dans le
// sous-titre de la décomposition.
type Key = "name" | "valeurRealisable" | "spreadPct" | "delaiMois";

type Dir = "asc" | "desc";

const COLS: { key: Key; label: string; unit?: string; num: boolean }[] = [
  { key: "name", label: "Freguesia", num: false },
  { key: "valeurRealisable", label: "Valeur réalisable", unit: "€/m²", num: true },
  { key: "spreadPct", label: "Spread", unit: "vs médiane Gaia", num: true },
  { key: "delaiMois", label: "Délai", unit: "mois", num: true },
];

export function ArbitrageTable({
  rows,
  mode,
  focusZone,
  onSelect,
}: {
  rows: ArbRow[];
  mode: Mode;
  focusZone: string | null;
  onSelect: (zone: string) => void;
}) {
  const [sort, setSort] = useState<{ key: Key; dir: Dir }>({ key: "spreadPct", dir: "desc" });
  const { Sg, pl } = useZoneNoun();
  // Until the user sorts: verdict groups, best arbitrage score first in each;
  // no column carries the ordering, so no arrow lights up.
  const [userSorted, setUserSorted] = useState(false);

  const SEP = "sep" as const;
  const items = useMemo<(ArbRow | typeof SEP)[]>(() => {
    // Displayed scores are rounded: break rounded-score ties by spread desc.
    const byScore = (a: ArbRow, b: ArbRow) =>
      Math.round(b.total) - Math.round(a.total) || b.spreadPct - a.spreadPct;
    if (!userSorted) {
      const openish = rows.filter((r) => verdictTone(mode, r.verdict) !== "low").sort(byScore);
      const closed = rows.filter((r) => verdictTone(mode, r.verdict) === "low").sort(byScore);
      return openish.length && closed.length ? [...openish, SEP, ...closed] : [...openish, ...closed];
    }
    const { key, dir } = sort;
    const r = [...rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      let cmp: number;
      if (typeof av === "string" || typeof bv === "string") {
        cmp = String(av ?? "").localeCompare(String(bv ?? ""), "fr");
      } else {
        const an = av == null ? -Infinity : (av as number);
        const bn = bv == null ? -Infinity : (bv as number);
        cmp = an - bn;
      }
      return dir === "asc" ? cmp : -cmp;
    });
    return r;
  }, [rows, sort, userSorted, mode]);

  const toggle = (key: Key) => {
    setUserSorted(true);
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" }
    );
  };

  return (
    <div className="shrink-0 overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-td">
          <thead className="bg-cream-200">
            <tr className="border-b border-navy/10">
              {COLS.map((c) => {
                const active = userSorted && sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    onClick={() => toggle(c.key)}
                    className={`cursor-pointer select-none px-3 py-2.5 font-semibold uppercase tracking-wide ${
                      c.num ? "text-right" : "text-left"
                    } ${active ? "text-navy" : "text-ink-soft hover:text-navy"}`}
                    title="Trier"
                  >
                    <span className="inline-flex items-center gap-1 text-th leading-tight">
                      {!c.num && <span className="w-1" />}
                      <span className="flex flex-col">
                        <span>{c.key === "name" ? Sg : c.label}</span>
                        {c.unit && <span className="text-label font-medium normal-case text-muted">{c.unit}</span>}
                      </span>
                      <span className={`text-[10px] ${active ? "text-gold-700" : "text-transparent"}`}>
                        {active ? (sort.dir === "asc" ? "▲" : "▼") : "▲"}
                      </span>
                    </span>
                  </th>
                );
              })}
              <th className="px-3 py-2.5 text-left text-th font-semibold uppercase tracking-wide text-ink-soft">
                Verdict
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              if (item === SEP) {
                return (
                  <tr key="sep">
                    <td
                      colSpan={COLS.length + 1}
                      className="border-y border-navy/10 bg-cream-200/60 px-3 py-1.5 text-label font-semibold uppercase tracking-widest text-muted"
                    >
                      Fenêtre fermée
                    </td>
                  </tr>
                );
              }
              const r = item;
              const on = r.zone === focusZone;
              return (
                <tr
                  key={r.zone}
                  onClick={() => onSelect(r.zone)}
                  className={`group cursor-pointer border-b border-navy/[0.06] transition-colors ${
                    on ? "bg-gold/10" : "hover:bg-cream-200/70"
                  }`}
                >
                  {/* name + score liseré */}
                  <td className="whitespace-nowrap py-2 pl-0 pr-3">
                    <span className="flex items-center gap-2.5">
                      <span
                        className="h-6 w-[3px] shrink-0 rounded-full"
                        style={{ background: scoreColor(r.total) }}
                      />
                      <span className={`font-medium ${on ? "text-navy" : "text-ink"}`}>{r.name}</span>
                      <span className="text-label text-ink-soft">{Math.round(r.total)}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{eur0(r.valeurRealisable)}</td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className="font-display text-[16px] font-medium tabular-nums"
                      style={{ color: verdictTextColor(mode, r.verdict) }}
                    >
                      {pctSigned(r.spreadPct)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink/80">
                    {r.delaiMois != null ? r.delaiMois.toFixed(1) : "–"}
                  </td>
                  <td className="px-3 py-2">
                    <VerdictBadge mode={mode} verdict={r.verdict} />
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={COLS.length + 1} className="px-4 py-10 text-center text-body text-ink-soft">
                  Chargement des {pl}…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
