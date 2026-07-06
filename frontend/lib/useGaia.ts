"use client";

import { useEffect, useMemo, useState } from "react";
import { api, AssetResponse, CityResponse, ModeScore, ZoneAllModes } from "./api";
import { Mode, MODES, MODE_KPI, MODE_LABEL, fmtNum, fmtSigned, median, pillarValue } from "./scoring";
import { PARC_SCE, parcFor } from "./energie";
import { setMemoDefaults } from "./session";
import { normFreguesia } from "./normalize";
import { cityBySlug } from "./cities";
import { useCityStore } from "./cityStore";
import type { Figure } from "@/components/KeyFigures";
import type { ChartRow } from "@/components/CityCharts";
import type { ZoneScore } from "@/components/GaiaMap";

// Ville active : slug du store (gaia par défaut) ; le municipio vient du
// registre des villes (lib/cities.ts).

export function displayName(name: string) {
  return name.replace(/^União das freguesias de /i, "").replace(/^Uniao das freguesias de /i, "");
}
export function shortName(name: string) {
  const base = displayName(name).split(/ e |,/)[0].trim();
  // Troncature propre : jamais d'espace traînant avant l'ellipse
  // (« Santa Maria Maior » → « Santa Maria… », pas « Santa Maria  … »).
  return base.length > 13 ? base.slice(0, 12).trimEnd() + "…" : base;
}
// Zones de maille fine (freguesias PT / communes BE), en excluant le municipio
// agrégé. Résultat identique pour Gaia/Lisbonne (leur seul autre niveau est
// municipio) et non vide pour Bruxelles (niveau commune).
const fregOnly = (c?: CityResponse) => (c?.zones || []).filter((z) => z.level !== "municipio");
const eur = (v: number | null | undefined) =>
  v != null ? `${Math.round(v).toLocaleString("fr-FR")} €/m²` : "–";

export function useGaia() {
  const citySlug = useCityStore((s) => s.slug);
  const cityReady = useCityStore((s) => s.ready);
  const CITY = citySlug;
  const CITY_ZONE = cityBySlug(citySlug).cityZoneId;
  const [mode, setMode] = useState<Mode>("promotion");
  const [assetClass, setAssetClass] = useState("residential");
  const [focusZone, setFocusZone] = useState<string>(CITY_ZONE);
  const [cityByKey, setCityByKey] = useState<Record<string, CityResponse>>({});
  const [zoneAll, setZoneAll] = useState<ZoneAllModes | null>(null);
  const [haya, setHaya] = useState<AssetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const keyOf = (m: Mode, c: string) => `${m}|${c}`;

  // Prefetch the four modes for the current class (map + key figures + rendement).
  // Gardé par cityReady : le slug persisté est hydraté AVANT le premier fetch
  // (CityKey, layout effect) : jamais de rafale Gaia jetée au changement de ville.
  useEffect(() => {
    if (!cityReady) return;
    MODES.forEach((m) => {
      const k = keyOf(m, assetClass);
      if (cityByKey[k]) return;
      api
        .city(CITY, m, assetClass)
        .then((c) => setCityByKey((p) => (p[k] ? p : { ...p, [k]: c })))
        .catch((e) => setError(String(e)));
    });
  }, [cityReady, CITY, assetClass, cityByKey]);

  // Actif vedette : absent pour les villes sans actif (Bruxelles, lot 2b) : on
  // ne fetch pas et haya reste null (aucun marqueur, aucun curseur).
  const promoAssetName = cityBySlug(citySlug).promoAsset?.apiName ?? null;
  useEffect(() => {
    if (!cityReady || !promoAssetName) return;
    api.asset(promoAssetName).then(setHaya).catch(() => {});
  }, [cityReady, promoAssetName]);

  // Focus zone's four modes (for score cards + detail), reactive to class.
  useEffect(() => {
    if (!cityReady) return;
    api.zone(focusZone, assetClass).then(setZoneAll).catch((e) => setError(String(e)));
  }, [cityReady, focusZone, assetClass]);

  const city = cityByKey[keyOf(mode, assetClass)];
  const detentionCity = cityByKey[keyOf("detention", assetClass)];
  const arbitrageCity = cityByKey[keyOf("arbitrage", assetClass)];
  const landbankCity = cityByKey[keyOf("landbank", assetClass)];
  // Promotion city for the current class, independent of the header mode, used by
  // the promotion-pinned "Prix & marge" module so it stays promotion-centric.
  const promoCity = cityByKey[keyOf("promotion", assetClass)];
  // All four modes for the current class: the overview shows them side by side.
  const citiesByMode = useMemo(() => {
    const out: Partial<Record<Mode, CityResponse>> = {};
    for (const m of MODES) out[m] = cityByKey[keyOf(m, assetClass)];
    return out;
  }, [cityByKey, assetClass]);

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
        { label: "Croissance annuelle", value: medYoy != null ? `${fmtSigned(medYoy, 1)}%` : "–", sub: "sur 12 mois" },
        { label: "Rendement net indicatif", value: medRend != null ? `${fmtNum(medRend, 1)}%` : "…", sub: MODE_LABEL[mode] === "Détention" ? "détention" : "indicatif" },
        { label: "Transactions / an", value: totalTx ? totalTx.toLocaleString("fr-FR") : "–", sub: "logements vendus" },
        { label: `${kpi.label}`, value: medKpi != null ? `${fmtNum(medKpi, kpi.digits)}${kpi.unit}` : "–", sub: "médiane freguesias" },
      ];
    }
    // Focused freguesia
    const r = focusRow;
    const rend = focusDetRow ? pillarValue(focusDetRow.pillars, "rendement_net") : null;
    const kpiVal = r ? pillarValue(r.pillars, kpi.pillar) : null;
    return [
      { label: "Prix médian", value: eur(r?.price_eur_m2 ?? null), sub: "cette zone" },
      { label: "Croissance annuelle", value: r?.yoy_pct != null ? `${fmtSigned(r.yoy_pct, 1)}%` : "–", sub: "sur 12 mois" },
      { label: "Rendement net indicatif", value: rend != null ? `${fmtNum(rend, 1)}%` : "…", sub: "détention" },
      { label: "Transactions / an", value: r?.n_transactions != null ? r.n_transactions.toLocaleString("fr-FR") : "–", sub: "logements vendus" },
      { label: kpi.label.replace(" médiane", "").replace(" méd.", ""), value: kpiVal != null ? `${fmtNum(kpiVal, kpi.digits)}${kpi.unit}` : "–", sub: MODE_LABEL[mode] },
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

  // Publish the page's current class/focus for the memo modal (Sidebar-mounted).
  useEffect(() => {
    setMemoDefaults({ assetClass, focusZone, cityZoneId: CITY_ZONE, freguesias });
  }, [assetClass, focusZone, freguesias]);

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
  // The generic third tile is the net yield, except in détention mode, where it
  // would duplicate the mode KPI: it becomes the E-F share of the stock instead.
  const quickFor = (zoneId: string) => {
    const r = city?.zones.find((z) => z.zone === zoneId);
    if (!r) return null;
    const d = detentionCity?.zones.find((z) => z.zone === zoneId);
    const kpi = MODE_KPI[mode];
    const kv = pillarValue(r.pillars, kpi.pillar);
    let extra: { label: string; value: string };
    if (mode === "detention") {
      const ef =
        r.level === "municipio"
          ? median(Object.keys(PARC_SCE).map((z) => parcFor(z, assetClass)?.ef ?? NaN))
          : parcFor(zoneId, assetClass)?.ef ?? null;
      extra = { label: "Parc E-F", value: ef != null ? `${Math.round(ef)}%` : "–" };
    } else {
      const rend = d ? pillarValue(d.pillars, "rendement_net") : null;
      extra = { label: "Rendement net", value: rend != null ? `${fmtNum(rend, 1)}%` : "…" };
    }
    return {
      name: displayName(r.zone_name),
      level: r.level,
      total: r.total,
      verdict: r.verdict,
      price: r.price_eur_m2,
      yoy: r.yoy_pct,
      extra,
      kpiLabel: kpi.label.replace(" médiane", "").replace(" méd.", ""),
      kpiValue: kv != null ? `${fmtNum(kv, kpi.digits)}${kpi.unit}` : null,
    };
  };

  return {
    quickFor,
    mode, setMode, assetClass, setAssetClass,
    focusZone, setFocusZone, isCityView, cityZoneId: CITY_ZONE,
    city, promoCity, detentionCity, arbitrageCity, landbankCity, citiesByMode, freguesias, scoresByNorm, scoreRange, hayaNorm, hayaZone,
    figures, chartRows, cardScores, focusName,
    detailScore, hayaProps, zoneAll, error,
  };
}
