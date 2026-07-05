"use client";

import { useMemo, useState } from "react";
import { Mode, scoreColor, verdictTextColor, verdictTone } from "@/lib/scoring";
import { eur0 } from "@/lib/priceMargin";
import { RdRow, pct2 } from "@/lib/rendement";
import { VerdictBadge } from "./ui";
import { useZoneNoun } from "@/lib/useZoneNoun";

// Détention table: same visual codes as PriceMarginTable (score liseré, verdict
// badge, sortable columns). Default grouping: Conserver/Surveiller above an
// "À céder" separator, net yield desc in each group; any user sort goes global.

type Key = "name" | "loyer" | "yieldBrut" | "chargesPctLoyer" | "fiscPctLoyer" | "yieldNet";

type Dir = "asc" | "desc";

const COLS: { key: Key; label: string; unit?: string; num: boolean }[] = [
  { key: "name", label: "Freguesia", num: false },
  { key: "loyer", label: "Loyer marché", unit: "€/m²/an", num: true },
  { key: "yieldBrut", label: "Yield brut", num: true },
  { key: "chargesPctLoyer", label: "Charges", unit: "% du loyer", num: true },
  { key: "fiscPctLoyer", label: "Fiscalité", unit: "% du loyer", num: true },
  { key: "yieldNet", label: "Yield net", num: true },
];

export function RendementTable({
  rows,
  mode,
  focusZone,
  onSelect,
}: {
  rows: RdRow[];
  mode: Mode;
  focusZone: string | null;
  onSelect: (zone: string) => void;
}) {
  const [sort, setSort] = useState<{ key: Key; dir: Dir }>({ key: "yieldNet", dir: "desc" });
  const { Sg, pl } = useZoneNoun();
  // Until the user sorts, group Conserver/Surveiller above Céder with a separator,
  // best detention score first inside each group (the held places open the table,
  // not the yield traps). Any sort click switches to a plain global sort.
  const [userSorted, setUserSorted] = useState(false);

  const SEP = "sep" as const;
  const items = useMemo<(RdRow | typeof SEP)[]>(() => {
    // Displayed scores are rounded: break rounded-score ties by net yield desc.
    const byScore = (a: RdRow, b: RdRow) =>
      Math.round(b.total) - Math.round(a.total) || b.yieldNet - a.yieldNet;
    if (!userSorted) {
      const keep = rows.filter((r) => verdictTone(mode, r.verdict) !== "low").sort(byScore);
      const ceder = rows.filter((r) => verdictTone(mode, r.verdict) === "low").sort(byScore);
      return keep.length && ceder.length ? [...keep, SEP, ...ceder] : [...keep, ...ceder];
    }
    const { key, dir } = sort;
    const r = [...rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      let cmp: number;
      if (typeof av === "string" || typeof bv === "string") {
        cmp = String(av).localeCompare(String(bv), "fr");
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
                // Before any user sort the table is grouped by verdict (score
                // desc): no column carries the ordering, so no arrow lights up.
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
                      À céder
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
                  <td className="px-3 py-2 text-right tabular-nums text-ink/80">{eur0(r.loyer)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{pct2(r.yieldBrut)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink/80">{r.chargesPctLoyer.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink/80">{r.fiscPctLoyer.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className="font-display text-[16px] font-medium tabular-nums"
                      style={{ color: verdictTextColor(mode, r.verdict) }}
                    >
                      {pct2(r.yieldNet)}
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
