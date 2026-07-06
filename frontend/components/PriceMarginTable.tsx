"use client";

import { useMemo, useState } from "react";
import { Mode, scoreColor, verdictTextColor, verdictTone } from "@/lib/scoring";
import { PmRow, eur0, pct0, pct1 } from "@/lib/priceMargin";
import { VerdictBadge } from "./ui";
import { useZoneNoun } from "@/lib/useZoneNoun";

type Key =
  | "name" | "baseMedian" | "premiumPct" | "realizable"
  | "construction" | "land" | "costTotal" | "marginPct";

type Dir = "asc" | "desc";

const COLS: { key: Key; label: string; unit?: string; num: boolean }[] = [
  { key: "name", label: "Freguesia", num: false },
  { key: "baseMedian", label: "Prix ancien", unit: "€/m²", num: true },
  { key: "premiumPct", label: "Prime neuf", num: true },
  { key: "realizable", label: "Prix neuf réal.", unit: "€/m²", num: true },
  { key: "construction", label: "Construction", unit: "€/m²", num: true },
  { key: "land", label: "Foncier", unit: "€/m²", num: true },
  { key: "costTotal", label: "Coût total", unit: "€/m²", num: true },
  // « de zone » : marge du neuf générique de la freguesia, distincte de la marge
  // de l'actif K-REST (curseur), qui porte son propre programme et sa propre base.
  { key: "marginPct", label: "Marge de zone", num: true },
];

export function PriceMarginTable({
  rows,
  mode,
  residential,
  focusZone,
  onSelect,
}: {
  rows: PmRow[];
  mode: Mode;
  residential: boolean;
  focusZone: string | null;
  onSelect: (zone: string) => void;
}) {
  // Default: richest margin first (rows already arrive margin-desc).
  const [sort, setSort] = useState<{ key: Key; dir: Dir }>({ key: "marginPct", dir: "desc" });
  const { Sg, pl } = useZoneNoun();
  // Until the user sorts, group viable (Go/Conditionnel) above the rest with a
  // separator. Any sort click switches to a plain global sort (no grouping).
  const [userSorted, setUserSorted] = useState(false);

  // Prix ancien / Prime neuf only apply to residential new-build (existing-stock
  // median + premium); commercial classes price at market → drop those 2 columns.
  const cols = residential ? COLS : COLS.filter((c) => c.key !== "baseMedian" && c.key !== "premiumPct");

  const SEP = "sep" as const;
  const items = useMemo<(PmRow | typeof SEP)[]>(() => {
    const byMargin = (a: PmRow, b: PmRow) => b.marginPct - a.marginPct;
    if (!userSorted) {
      const viable = rows.filter((r) => verdictTone(mode, r.verdict) !== "low").sort(byMargin);
      const passer = rows.filter((r) => verdictTone(mode, r.verdict) === "low").sort(byMargin);
      return viable.length && passer.length ? [...viable, SEP, ...passer] : [...viable, ...passer];
    }
    const { key, dir } = sort;
    const r = [...rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      let cmp: number;
      if (typeof av === "string" || typeof bv === "string") {
        cmp = String(av).localeCompare(String(bv), "fr");
      } else {
        // nulls (commercial prix ancien / prime) sink to the bottom
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
              {cols.map((c) => {
                const active = sort.key === c.key;
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
                      colSpan={cols.length + 1}
                      className="border-y border-navy/10 bg-cream-200/60 px-3 py-1.5 text-label font-semibold uppercase tracking-widest text-muted"
                    >
                      Sous le seuil de viabilité
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
                  {residential && (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums text-ink/80">{eur0(r.baseMedian)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink/80">{pct0(r.premiumPct)}</td>
                    </>
                  )}
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{eur0(r.realizable)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink/80">{eur0(r.construction)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink/80">{eur0(r.land)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-ink">{eur0(r.costTotal)}</td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className="font-display text-[16px] font-medium tabular-nums"
                      style={{ color: verdictTextColor(mode, r.verdict) }}
                    >
                      {pct1(r.marginPct)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <VerdictBadge mode={mode} verdict={r.verdict} />
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={cols.length + 1} className="px-4 py-10 text-center text-body text-ink-soft">
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
