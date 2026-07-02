"use client";

import { useEffect, useMemo, useState } from "react";
import { api, AssetResponse, CityResponse, ModeScore, ZoneAllModes } from "./api";
import { Mode, MODES, MODE_KPI, MODE_LABEL, median, pillarValue } from "./scoring";
import { normFreguesia } from "./normalize";
import type { Figure } from "@/components/KeyFigures";
import type { ChartRow } from "@/components/CityCharts";
import type { ZoneScore } from "@/components/GaiaMap";

const CITY = "gaia";
const CITY_ZONE = "vilanovadegaia"; // município = aggregate "city view"

export function displayName(name: string) {
  return name.replace(/^União das freguesias de /i, "").replace(/^Uniao das freguesias de /i, "");
}
export function shortName(name: string) {
  const base = displayName(name).split(/ e |,/)[0].trim();
  return base.length > 13 ? base.slice(0, 12) + "…" : base;
}
const fregOnly = (c?: CityResponse) => (c?.zones || []).filter((z) => z.level === "freguesia");
const eur = (v: number | null | undefined) =>
  v != null ? `${Math.round(v).toLocaleString("fr-FR")} €/m²` : "—";

export function useGaia() {
  const [mode, setMode] = useState<Mode>("promotion");
  const [assetClass, setAssetClass] = useState("residential");
  const [focusZone, setFocusZone] = useState<string>(CITY_ZONE);
  const [cityByKey, setCityByKey] = useState<Record<string, CityResponse>>({});
  const [zoneAll, setZoneAll] = useState<ZoneAllModes | null>(null);
  const [haya, setHaya] = useState<AssetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const keyOf = (m: Mode, c: string) => `${m}|${c}`;

  // Prefetch the four modes for the current class (map + key figures + rendement).
  useEffect(() => {
    MODES.forEach((m) => {
      const k = keyOf(m, assetClass);
      if (cityByKey[k]) return;
      api
        .city(CITY, m, assetClass)
        .then((c) => setCityByKey((p) => (p[k] ? p : { ...p, [k]: c })))
        .catch((e) => setError(String(e)));
    });
  }, [assetClass, cityByKey]);

  useEffect(() => {
    api.asset("haya").then(setHaya).catch(() => {});
  }, []);

  // Focus zone's four modes (for score cards + detail), reactive to class.
  useEffect(() => {
    api.zone(focusZone, assetClass).then(setZoneAll).catch((e) => setError(String(e)));
  }, [focusZone, assetClass]);

  const city = cityByKey[keyOf(mode, assetClass)];
  const detentionCity = cityByKey[keyOf("detention", assetClass)];
  // Promotion city for the current class, independent of the header mode — used by
  // the promotion-pinned "Prix & marge" module so it stays promotion-centric.
  const promoCity = cityByKey[keyOf("promotion", assetClass)];

  const hayaZone = haya?.zone;
  const hayaNorm = useMemo(
    () => (haya ? normFreguesia(haya.scores.promotion.zone_name) : "santa marinha e sao pedro da afurada"),
    [haya]
  );

  const isCityView = focusZone === CITY_ZONE;
  const focusRow = useMemo(() => city?.zones.find((z) => z.zone === focusZone), [city, focusZone]);
  const focusDetRow = useMemo(
    () => detentionCity?.zones.find((z) => z.zone === focusZone),
    [detentionCity, focusZone]
  );

  const figures: Figure[] = useMemo(() => {
    const rows = fregOnly(city);
    const det = fregOnly(detentionCity);
    const kpi = MODE_KPI[mode];
    if (isCityView) {
      const medPrice = median(rows.map((r) => (r.price_eur_m2 ?? NaN) as number));
      const medYoy = median(rows.map((r) => (r.yoy_pct ?? NaN) as number));
      const totalTx = rows.reduce((s, r) => s + (r.n_transactions ?? 0), 0);
      const medRend = median(det.map((z) => pillarValue(z.pillars, "rendement_net") ?? NaN));
      const medKpi = median(rows.map((z) => pillarValue(z.pillars, kpi.pillar) ?? NaN));
      return [
        { label: "Prix médian", value: eur(medPrice), sub: "freguesias" },
        { label: "Croissance annuelle", value: medYoy != null ? `${medYoy >= 0 ? "+" : ""}${medYoy.toFixed(1)}%` : "—", sub: "sur 12 mois" },
        { label: "Rendement net indicatif", value: medRend != null ? `${medRend.toFixed(1)}%` : "…", sub: MODE_LABEL[mode] === "Détention" ? "détention" : "indicatif" },
        { label: "Transactions / an", value: totalTx ? totalTx.toLocaleString("fr-FR") : "—", sub: "logements vendus" },
        { label: `${kpi.label}`, value: medKpi != null ? `${medKpi.toFixed(kpi.digits)}${kpi.unit}` : "—", sub: "médiane freguesias" },
      ];
    }
    // Focused freguesia
    const r = focusRow;
    const rend = focusDetRow ? pillarValue(focusDetRow.pillars, "rendement_net") : null;
    const kpiVal = r ? pillarValue(r.pillars, kpi.pillar) : null;
    return [
      { label: "Prix médian", value: eur(r?.price_eur_m2 ?? null), sub: "cette zone" },
      { label: "Croissance annuelle", value: r?.yoy_pct != null ? `${r.yoy_pct >= 0 ? "+" : ""}${r.yoy_pct.toFixed(1)}%` : "—", sub: "sur 12 mois" },
      { label: "Rendement net indicatif", value: rend != null ? `${rend.toFixed(1)}%` : "…", sub: "détention" },
      { label: "Transactions / an", value: r?.n_transactions != null ? r.n_transactions.toLocaleString("fr-FR") : "—", sub: "logements vendus" },
      { label: kpi.label.replace(" médiane", "").replace(" méd.", ""), value: kpiVal != null ? `${kpiVal.toFixed(kpi.digits)}${kpi.unit}` : "—", sub: MODE_LABEL[mode] },
    ];
  }, [city, detentionCity, mode, isCityView, focusRow, focusDetRow]);

  const chartRows: ChartRow[] = useMemo(
    () =>
      fregOnly(city)
        .map((z) => ({ name: displayName(z.zone_name), short: shortName(z.zone_name), score: z.total, price: z.price_eur_m2, verdict: z.verdict }))
        .sort((a, b) => b.score - a.score),
    [city]
  );

  const scoresByNorm = useMemo(() => {
    const m: Record<string, ZoneScore> = {};
    for (const z of fregOnly(city)) m[normFreguesia(z.zone_name)] = { zoneId: z.zone, zoneName: displayName(z.zone_name), total: z.total, verdict: z.verdict };
    return m;
  }, [city]);

  const scoreRange = useMemo(() => {
    const s = fregOnly(city).map((z) => z.total);
    return s.length ? { min: Math.min(...s), max: Math.max(...s) } : { min: 0, max: 100 };
  }, [city]);

  const freguesias = useMemo(
    () => fregOnly(city).map((z) => ({ id: z.zone, label: displayName(z.zone_name) })).sort((a, b) => a.label.localeCompare(b.label)),
    [city]
  );

  const cardScores = useMemo(() => {
    const out: Partial<Record<Mode, ModeScore>> = {};
    if (zoneAll) for (const m of MODES) out[m] = zoneAll.scores[m];
    return out;
  }, [zoneAll]);

  const isHayaCase = focusZone === hayaZone && mode === "promotion" && !!haya;
  const detailScore: ModeScore | null = isHayaCase ? haya!.scores.promotion : zoneAll?.scores[mode] ?? null;
  const hayaProps = useMemo(() => {
    if (!isHayaCase || !haya) return null;
    const promo = haya.scores.promotion;
    const marge = promo.pillars.find((p) => p.pillar === "marge");
    return { baseTotal: promo.total, margeWeight: marge?.weight ?? 0.3 };
  }, [isHayaCase, haya]);

  const focusName = zoneAll ? displayName(zoneAll.scores[mode].zone_name) : "…";

  // Quick per-zone snapshot for the map's compact panel (from prefetched data).
  const quickFor = (zoneId: string) => {
    const r = city?.zones.find((z) => z.zone === zoneId);
    if (!r) return null;
    const d = detentionCity?.zones.find((z) => z.zone === zoneId);
    const kpi = MODE_KPI[mode];
    const kv = pillarValue(r.pillars, kpi.pillar);
    return {
      name: displayName(r.zone_name),
      level: r.level,
      total: r.total,
      verdict: r.verdict,
      price: r.price_eur_m2,
      yoy: r.yoy_pct,
      rendement: d ? pillarValue(d.pillars, "rendement_net") : null,
      kpiLabel: kpi.label.replace(" médiane", "").replace(" méd.", ""),
      kpiValue: kv != null ? `${kv.toFixed(kpi.digits)}${kpi.unit}` : null,
    };
  };

  return {
    quickFor,
    mode, setMode, assetClass, setAssetClass,
    focusZone, setFocusZone, isCityView, cityZoneId: CITY_ZONE,
    city, promoCity, freguesias, scoresByNorm, scoreRange, hayaNorm, hayaZone,
    figures, chartRows, cardScores, focusName,
    detailScore, hayaProps, zoneAll, error,
  };
}
