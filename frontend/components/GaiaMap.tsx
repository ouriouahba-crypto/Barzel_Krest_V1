"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import { CircleMarker, GeoJSON, MapContainer, Tooltip, ZoomControl, useMap } from "react-leaflet";
import type { Layer, PathOptions, LeafletMouseEvent } from "leaflet";
import { Mode, scoreColor } from "@/lib/scoring";
import { normFreguesia } from "@/lib/normalize";

export interface ZoneScore {
  zoneId: string;
  zoneName: string;
  total: number;
  verdict: string;
}

// Stable reference so react-leaflet never re-applies setStyle to the marker
// (a fresh pathOptions object each render crashes _updateBounds pre-projection).
const HAYA_MARKER_OPTS = { color: "#0A1628", weight: 2, fillColor: "#C9A86A", fillOpacity: 1 };

function FitBounds({ data }: { data: FeatureCollection }) {
  const map = useMap();
  useEffect(() => {
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const f of data.features) {
      const poly = f.geometry as Polygon;
      for (const ring of poly.coordinates) {
        for (const [lng, lat] of ring) {
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
          minLng = Math.min(minLng, lng);
          maxLng = Math.max(maxLng, lng);
        }
      }
    }
    const bounds: [[number, number], [number, number]] = [
      [minLat, minLng],
      [maxLat, maxLng],
    ];
    const fit = () => {
      try {
        map.fitBounds(bounds, { padding: [10, 10] });
      } catch {
        /* not ready yet */
      }
    };
    fit();
    // Leaflet fires 'resize' after it has updated its own size (incl. window
    // trackResize) — refitting here is safe (renderer already valid).
    map.on("resize", fit);
    return () => {
      map.off("resize", fit);
    };
  }, [data, map]);
  return null;
}

function centroid(f: Feature): [number, number] {
  const ring = (f.geometry as Polygon).coordinates[0];
  let x = 0,
    y = 0;
  for (const [lng, lat] of ring) {
    x += lng;
    y += lat;
  }
  return [y / ring.length, x / ring.length];
}

export default function GaiaMap({
  scoresByNorm,
  selected,
  onSelectZone,
  hayaNorm,
  mode,
  focusZoneId,
  onHoverZone,
}: {
  scoresByNorm: Record<string, ZoneScore>;
  selected: string[];
  onSelectZone: (zoneId: string) => void;
  hayaNorm: string;
  mode: Mode;
  focusZoneId?: string | null;
  onHoverZone?: (zoneId: string | null) => void;
}) {
  const [geo, setGeo] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    fetch("/geo/gaia_freguesias.geojson")
      .then((r) => r.json())
      .then(setGeo)
      .catch(() => setGeo(null));
  }, []);

  const hayaFeature = useMemo(
    () => geo?.features.find((f) => normFreguesia((f.properties as any)?.freguesia) === hayaNorm),
    [geo, hayaNorm]
  );

  if (!geo) {
    return <div className="flex h-full items-center justify-center bg-navy text-cream/50">Chargement de la carte…</div>;
  }

  const isIncluded = (zoneId: string | undefined) => selected.length === 0 || (zoneId ? selected.includes(zoneId) : false);

  const style = (feature?: Feature): PathOptions => {
    const norm = normFreguesia((feature?.properties as any)?.freguesia);
    const zs = scoresByNorm[norm];
    const included = isIncluded(zs?.zoneId);
    const isFocus = !!focusZoneId && zs?.zoneId === focusZoneId;
    return {
      fillColor: scoreColor(zs?.total),
      fillOpacity: included ? 0.92 : 0.2,
      color: isFocus ? "#C9A86A" : "#FFFFFF",
      weight: isFocus ? 2.5 : 1,
      opacity: included ? 1 : 0.5,
    };
  };

  const onEach = (feature: Feature, layer: Layer) => {
    const norm = normFreguesia((feature.properties as any)?.freguesia);
    const zs = scoresByNorm[norm];
    const isFocus = !!focusZoneId && zs?.zoneId === focusZoneId;
    const name = zs?.zoneName || (feature.properties as any)?.freguesia;
    const scoreTxt = zs ? `${Math.round(zs.total)}/100 · ${zs.verdict}` : "—";
    layer.bindTooltip(
      `<div style="font-weight:600">${name}</div><div style="color:#C9A86A">${scoreTxt}</div>`,
      { sticky: true, className: "freg-tooltip", direction: "top", opacity: 1 }
    );
    layer.on({
      click: () => zs && onSelectZone(zs.zoneId),
      mouseover: (e: LeafletMouseEvent) => {
        (e.target as any).setStyle({ weight: 2.5, color: "#C9A86A" });
        (e.target as any).bringToFront?.();
        if (zs) onHoverZone?.(zs.zoneId);
      },
      mouseout: (e: LeafletMouseEvent) => {
        (e.target as any).setStyle({ weight: isFocus ? 2.5 : 1, color: isFocus ? "#C9A86A" : "#FFFFFF" });
        onHoverZone?.(null);
      },
    });
  };

  return (
    <MapContainer
      style={{ height: "100%", width: "100%", background: "#0A1628" }}
      zoomControl={false}
      attributionControl={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      zoomSnap={0}
      className="rounded-2xl"
    >
      <FitBounds data={geo} />
      <ZoomControl position="bottomright" />
      {/* key forces restyle on mode / selection / focus change */}
      <GeoJSON key={`${mode}-${selected.join(",")}-${focusZoneId ?? ""}`} data={geo} style={style} onEachFeature={onEach} />
      {hayaFeature && (
        <CircleMarker
          center={centroid(hayaFeature)}
          radius={9}
          pathOptions={HAYA_MARKER_OPTS}
          eventHandlers={{ click: () => onSelectZone(scoresByNorm[hayaNorm]?.zoneId) }}
        >
          <Tooltip direction="top" offset={[0, -6]} className="freg-tooltip" opacity={1}>
            <div style={{ fontWeight: 600 }}>Haya Towers</div>
            <div style={{ color: "#C9A86A" }}>Actif K-REST · Promotion</div>
          </Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
