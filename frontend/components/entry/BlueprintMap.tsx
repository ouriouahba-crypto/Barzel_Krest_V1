"use client";

// Carte blueprint navy/or de la couche d'entrée (lot 2), 100% hors-ligne :
// géométries de world-atlas (countries-50m) extraites via topojson-client,
// projetées avec d3-geo. Aucune tuile, aucune clé, aucun appel réseau au
// runtime. Deux étapes internes à un même composant (pas de rechargement entre
// pays et ville, fly-to continu) :
//   - "country" : Portugal et Belgique tracés au lancement (stroke-dashoffset),
//     le reste de l'Europe en contexte discret, graticule pour l'ADN "plan".
//   - "city"    : fly-to (zoom transform) sur le pays choisi, marqueurs villes
//     projetés du registre qui éclosent en léger décalage.
// Porto et Gaia (collés sur le Douro) sont décollés par une leader line.
// Tout est skippable ; prefers-reduced-motion rend l'état final direct.
//
// Rendu client uniquement (importé en dynamic ssr:false) : window / rAF /
// getTotalLength disponibles, aucune divergence d'hydratation.

import { useEffect, useMemo, useRef, useState } from "react";
import worldData from "world-atlas/countries-50m.json";
import { feature } from "topojson-client";
import { geoMercator, geoPath, geoGraticule10 } from "d3-geo";
import type { Feature, FeatureCollection } from "geojson";
import { CITIES, COUNTRY_GEO_ID, type CountryCode } from "@/lib/cities";
import { useCityStore } from "@/lib/cityStore";
import { useLang, useT } from "@/lib/i18n/useT";
import { countryDisplay, cityDisplay } from "@/lib/i18n/display";

// --- Géométrie (calculée une fois, au chargement du chunk client) ----------
const W = 1000;
const H = 680;
const PAD = 96;
const HL_CODES: CountryCode[] = ["pt", "be"];

type NamedFeature = Feature<any, { name?: string }>;

const worldFC = feature(worldData as any, (worldData as any).objects.countries) as unknown as FeatureCollection<
  any,
  { name?: string }
>;

// Fenêtre Europe de l'Ouest : on clippe les territoires d'outre-mer (Açores et
// Madère pour PT, Canaries pour ES, Guyane pour FR...) pour un tracé net et un
// fit correct. Une feature dont AUCUN polygone n'a de sommet dans la fenêtre est
// écartée : il ne reste que l'Europe, servant aussi de contexte léger.
const WIN = { w: -11, e: 14, s: 34, n: 58 };
const ringInWindow = (ring: number[][]) =>
  ring.some(([lon, lat]) => lon >= WIN.w && lon <= WIN.e && lat >= WIN.s && lat <= WIN.n);

function clipToWindow(f: NamedFeature): NamedFeature | null {
  const g: any = f.geometry;
  if (!g) return null;
  if (g.type === "Polygon") return ringInWindow(g.coordinates[0]) ? f : null;
  if (g.type === "MultiPolygon") {
    const polys = g.coordinates.filter((poly: number[][][]) => ringInWindow(poly[0]));
    return polys.length ? ({ ...f, geometry: { ...g, coordinates: polys } } as NamedFeature) : null;
  }
  return null;
}

const clippedById = new Map<string, NamedFeature>();
for (const f of worldFC.features) {
  const c = clipToWindow(f as NamedFeature);
  if (c) clippedById.set(String((f as any).id), c);
}

const HL_IDS = HL_CODES.map((c) => COUNTRY_GEO_ID[c]);
const highlightFC: FeatureCollection = {
  type: "FeatureCollection",
  features: HL_IDS.map((id) => clippedById.get(id)).filter(Boolean) as any,
};

const projection = geoMercator().fitExtent(
  [
    [PAD, PAD],
    [W - PAD, H - PAD],
  ],
  highlightFC as any,
);
const pathGen = geoPath(projection);
const graticulePath = pathGen(geoGraticule10()) || "";

const contextPaths = [...clippedById.entries()]
  .filter(([id]) => !HL_IDS.includes(id))
  .map(([, f]) => pathGen(f as any) || "");

const highlights = HL_CODES.map((code) => {
  const f = clippedById.get(COUNTRY_GEO_ID[code]);
  if (!f) return null;
  return { code, d: pathGen(f as any) || "", centroid: pathGen.centroid(f as any) as [number, number] };
}).filter(Boolean) as { code: CountryCode; d: string; centroid: [number, number] }[];

// Marqueurs villes projetés depuis le registre (jamais en dur ici).
const cityPts = CITIES.map((c) => ({
  slug: c.slug,
  label: c.label,
  code: c.country,
  base: (projection(c.coords) as [number, number]) || [0, 0],
}));

type Transform = { k: number; tx: number; ty: number };
const OVERVIEW: Transform = { k: 1, tx: 0, ty: 0 };

function targetFor(code: CountryCode): Transform {
  const f = clippedById.get(COUNTRY_GEO_ID[code]);
  if (!f) return OVERVIEW;
  const [[x0, y0], [x1, y1]] = pathGen.bounds(f as any);
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const k = Math.min(Math.min(W / w, H / h) * 0.55, 16);
  return { k, tx: W / 2 - (k * (x0 + x1)) / 2, ty: H / 2 - (k * (y0 + y1)) / 2 };
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const apply = (t: Transform, p: [number, number]): [number, number] => [t.tx + t.k * p[0], t.ty + t.k * p[1]];

// Décollage des marqueurs trop proches (Porto/Gaia) : positions réelles gardées,
// marqueur décalé radialement avec une leader line vers le point réel.
const COLLIDE_PX = 34;
const SPREAD = 30;
type Placed = { slug: string; label: string; real: [number, number]; pos: [number, number]; displaced: boolean };

function declutter(items: { slug: string; label: string; real: [number, number] }[]): Placed[] {
  const n = items.length;
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (Math.hypot(items[i].real[0] - items[j].real[0], items[i].real[1] - items[j].real[1]) < COLLIDE_PX)
        parent[find(i)] = find(j);
    }
  const clusters = new Map<number, number[]>();
  items.forEach((_, i) => {
    const r = find(i);
    (clusters.get(r) ?? clusters.set(r, []).get(r)!).push(i);
  });
  const out: Placed[] = items.map((it) => ({ ...it, pos: [...it.real] as [number, number], displaced: false }));
  for (const idxs of clusters.values()) {
    if (idxs.length < 2) continue;
    const cx = idxs.reduce((s, i) => s + items[i].real[0], 0) / idxs.length;
    const cy = idxs.reduce((s, i) => s + items[i].real[1], 0) / idxs.length;
    const ordered = [...idxs].sort((a, b) => items[a].real[1] - items[b].real[1]); // nord (y bas) d'abord
    const m = ordered.length;
    ordered.forEach((i, rank) => {
      const t = m === 1 ? 0 : rank / (m - 1) - 0.5;
      out[i].pos = [cx + (rank % 2 === 0 ? 1 : -1) * SPREAD * 0.6, cy + t * SPREAD * 2];
      out[i].displaced = true;
    });
  }
  return out;
}

export interface BlueprintMapProps {
  initialStep: "country" | "city";
  /** sélection ville découplée de la navigation (le lot 3 branchera la révélation) */
  onCitySelected: (slug: string) => void;
}

export default function BlueprintMap({ initialStep, onCitySelected }: BlueprintMapProps) {
  const storeCountry = useCityStore((s) => s.country);
  const setCountry = useCityStore((s) => s.setCountry);
  const lang = useLang();
  const t = useT();

  const [reduce] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const startCity = initialStep === "city" ? storeCountry : null;

  const [step, setStep] = useState<"country" | "city">(startCity ? "city" : "country");
  const [selected, setSelected] = useState<CountryCode | null>(startCity);
  const [transform, setTransform] = useState<Transform>(() => (startCity ? targetFor(startCity) : OVERVIEW));
  const [markersIn, setMarkersIn] = useState<boolean>(!!startCity);
  const [drawn, setDrawn] = useState<boolean>(!!startCity || reduce);
  const [flying, setFlying] = useState(false);
  const [hoverCountry, setHoverCountry] = useState<CountryCode | null>(null);
  const [hoverCity, setHoverCity] = useState<string | null>(null);

  const rafRef = useRef<number | null>(null);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const animateDraw = !reduce && initialStep !== "city";

  // Tracé des pays au lancement (country step).
  useEffect(() => {
    if (!animateDraw) return;
    const paths = pathRefs.current.filter(Boolean) as SVGPathElement[];
    paths.forEach((p) => {
      const len = p.getTotalLength();
      p.style.transition = "none";
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = String(len);
    });
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        paths.forEach((p, i) => {
          p.style.transition = `stroke-dashoffset 1.5s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.18}s`;
          p.style.strokeDashoffset = "0";
        });
      }),
    );
    const t = window.setTimeout(() => setDrawn(true), 2000);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => cancelAnimationFrame(rafRef.current ?? 0), []);

  const finishDraw = () => {
    (pathRefs.current.filter(Boolean) as SVGPathElement[]).forEach((p) => {
      p.style.transition = "none";
      p.style.strokeDashoffset = "0";
    });
    setDrawn(true);
  };

  const animateTransform = (from: Transform, to: Transform, onDone?: () => void) => {
    cancelAnimationFrame(rafRef.current ?? 0);
    setFlying(true);
    const t0 = performance.now();
    const dur = 1500;
    const frame = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = easeInOutCubic(p);
      setTransform({ k: lerp(from.k, to.k, e), tx: lerp(from.tx, to.tx, e), ty: lerp(from.ty, to.ty, e) });
      if (p < 1) rafRef.current = requestAnimationFrame(frame);
      else {
        setFlying(false);
        onDone?.();
      }
    };
    rafRef.current = requestAnimationFrame(frame);
  };

  const selectCountry = (code: CountryCode) => {
    if (step !== "country") return;
    setCountry(code);
    setSelected(code);
    setStep("city");
    finishDraw();
    if (reduce) {
      setTransform(targetFor(code));
      setMarkersIn(true);
    } else {
      setMarkersIn(false);
      animateTransform(OVERVIEW, targetFor(code), () => setMarkersIn(true));
    }
  };

  const backToCountry = () => {
    if (step !== "city") return;
    const from = selected ? targetFor(selected) : transform;
    setStep("country");
    setSelected(null);
    setMarkersIn(false);
    setHoverCity(null);
    if (reduce) setTransform(OVERVIEW);
    else animateTransform(from, OVERVIEW);
  };

  const skip = () => {
    finishDraw();
    if (flying && selected) {
      cancelAnimationFrame(rafRef.current ?? 0);
      setTransform(targetFor(selected));
      setFlying(false);
      setMarkersIn(true);
    }
  };

  // Marqueurs du pays sélectionné, en coordonnées écran (transform courant).
  const placed = useMemo<Placed[]>(() => {
    if (!selected) return [];
    return declutter(
      cityPts
        .filter((c) => c.code === selected)
        .map((c) => ({ slug: c.slug, label: c.label, real: apply(transform, c.base) })),
    );
  }, [selected, transform]);

  const showSkip = (step === "country" && !drawn && !reduce) || flying;
  const dim = step === "city";

  return (
    <div className="relative min-h-0 flex-1">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full">
        {/* Groupe transformé (fly-to) : géométries pays */}
        <g transform={`translate(${transform.tx}, ${transform.ty}) scale(${transform.k})`}>
          <path
            d={graticulePath}
            fill="none"
            stroke="#C9A86A"
            strokeWidth={0.6}
            opacity={dim ? 0.04 : 0.09}
            vectorEffect="non-scaling-stroke"
            style={{ transition: "opacity 1s ease", pointerEvents: "none" }}
          />
          {contextPaths.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke="#6B7A8D"
              strokeWidth={0.7}
              opacity={dim ? 0.1 : 0.2}
              vectorEffect="non-scaling-stroke"
              style={{ transition: "opacity 1s ease", pointerEvents: "none" }}
            />
          ))}
          {highlights.map((h, i) => {
            const isSel = selected === h.code;
            const isHover = hoverCountry === h.code;
            const active = step === "country";
            const faded = dim && !isSel;
            return (
              <path
                key={h.code}
                data-country={h.code}
                ref={(el) => {
                  pathRefs.current[i] = el;
                }}
                d={h.d}
                fill={active && isHover ? "rgba(201,168,106,0.10)" : "rgba(201,168,106,0.035)"}
                stroke="#C9A86A"
                strokeWidth={(isHover ? 2 : 1.4) / transform.k}
                opacity={faded ? 0.28 : 1}
                style={{
                  transition: "opacity 1s ease, fill 0.25s ease",
                  cursor: active ? "pointer" : "default",
                  pointerEvents: active ? "auto" : "none",
                  filter: isHover ? "drop-shadow(0 0 5px rgba(201,168,106,0.55))" : "none",
                }}
                onMouseEnter={() => active && setHoverCountry(h.code)}
                onMouseLeave={() => setHoverCountry(null)}
                onClick={(e) => {
                  // Le pays sélectionné vient de l'élément qui reçoit réellement
                  // le clic (data-country), pas d'une capture de closure : immunise
                  // contre tout aléa de hit-testing ou d'état obsolète.
                  const code = (e.currentTarget as SVGPathElement).getAttribute("data-country") as CountryCode | null;
                  if (code) selectCountry(code);
                }}
              />
            );
          })}
        </g>

        {/* Overlay écran (non transformé) : libellés pays, leader lines, marqueurs */}
        <g>
          {highlights.map((h) => {
            const [lx, ly] = apply(transform, h.centroid);
            return (
              <text
                key={h.code}
                x={lx}
                y={ly}
                textAnchor="middle"
                className="font-display"
                fill="#E0CBA0"
                stroke="#0A1628"
                strokeWidth={3}
                paintOrder="stroke"
                fontSize={20}
                fontWeight={600}
                opacity={step === "country" ? (hoverCountry === h.code ? 1 : 0.85) : 0}
                style={{ transition: "opacity 0.6s ease", pointerEvents: "none" }}
              >
                {countryDisplay(h.code, lang)}
              </text>
            );
          })}

          {placed.map((m, i) => {
            const isHover = hoverCity === m.slug;
            const s = markersIn ? (isHover ? 1.25 : 1) : 0;
            const delay = i * 0.09;
            return (
              <g key={m.slug} data-marker={m.slug} data-displaced={m.displaced ? "1" : "0"}>
                {m.displaced && (
                  <>
                    <line
                      data-leader={m.slug}
                      x1={m.real[0]}
                      y1={m.real[1]}
                      x2={m.pos[0]}
                      y2={m.pos[1]}
                      stroke="#C9A86A"
                      strokeWidth={0.8}
                      opacity={markersIn ? 0.5 : 0}
                      style={{ transition: `opacity 0.4s ease ${delay}s`, pointerEvents: "none" }}
                    />
                    <circle
                      cx={m.real[0]}
                      cy={m.real[1]}
                      r={1.6}
                      fill="#C9A86A"
                      opacity={markersIn ? 0.7 : 0}
                      style={{ transition: `opacity 0.4s ease ${delay}s`, pointerEvents: "none" }}
                    />
                  </>
                )}
                <g transform={`translate(${m.pos[0]}, ${m.pos[1]})`}>
                  <g
                    data-city={m.slug}
                    style={{
                      transform: `scale(${s})`,
                      opacity: markersIn ? 1 : 0,
                      transition: `transform 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}s, opacity 0.45s ease ${delay}s`,
                      cursor: "pointer",
                    }}
                    onMouseEnter={() => setHoverCity(m.slug)}
                    onMouseLeave={() => setHoverCity(null)}
                    onClick={() => onCitySelected(m.slug)}
                  >
                    <circle r={16} fill="transparent" />
                    <circle r={7} fill="rgba(201,168,106,0.12)" stroke="#C9A86A" strokeWidth={1.4} />
                    <circle r={2.4} fill="#E0CBA0" />
                    <text
                      x={0}
                      y={-14}
                      textAnchor="middle"
                      className="font-display"
                      fill="#F8F5EE"
                      stroke="#0A1628"
                      strokeWidth={3}
                      paintOrder="stroke"
                      fontSize={13}
                      style={{ pointerEvents: "none" }}
                    >
                      {cityDisplay(m.slug, lang)}
                    </text>
                  </g>
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Titre d'étape (overlay HTML) */}
      <div className="pointer-events-none absolute inset-x-0 top-1 flex flex-col items-center px-6 text-center">
        <p className="text-label uppercase tracking-[0.32em] text-gold/80">
          {t("entry.step", { n: step === "country" ? "1" : "2" })}
        </p>
        <h1 className="mt-2 font-display text-[clamp(24px,4vw,38px)] font-medium text-cream">
          {step === "country"
            ? t("entry.chooseCountry")
            : `${t("entry.chooseCity")}${selected ? ` · ${countryDisplay(selected, lang)}` : ""}`}
        </h1>
      </div>

      {step === "city" && (
        <button
          type="button"
          onClick={backToCountry}
          className="absolute bottom-6 left-6 inline-flex items-center gap-2 rounded-full border border-cream/20 bg-navy-700/60 px-4 py-2 text-btn text-cream/80 transition-colors hover:border-gold/50 hover:text-gold-300"
        >
          <span aria-hidden>‹</span> {t("entry.backCountry")}
        </button>
      )}

      {showSkip && (
        <button
          type="button"
          onClick={skip}
          className="absolute bottom-6 right-6 inline-flex items-center gap-2 rounded-full border border-cream/20 bg-navy-700/60 px-4 py-2 text-btn text-cream/80 transition-colors hover:border-gold/50 hover:text-gold-300"
        >
          {t("entry.skip")} <span aria-hidden>»</span>
        </button>
      )}
    </div>
  );
}
