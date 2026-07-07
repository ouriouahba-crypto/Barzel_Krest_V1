"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { DetailPanel, KeyFigure } from "@/components/DetailPanel";
import { MapLegendBar } from "@/components/CityBits";
import { ScoreDial, VerdictBadge } from "@/components/ui";
import { SignalAffordance } from "@/components/collab/SignalAffordance";
import { takePendingFocus } from "@/lib/collab/focusBridge";
import { useGaia } from "@/lib/useGaia";
import { Mode, MODE_KPI, fmtSigned } from "@/lib/scoring";
import { ModeScore } from "@/lib/api";
import { cityBySlug } from "@/lib/cities";
import { useCityStore } from "@/lib/cityStore";

const GaiaMap = dynamic(() => import("@/components/GaiaMap"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-navy text-body text-cream/70">Carte…</div>,
});

// Ligne marché : registre des villes (lib/cities.ts).

function detailFigures(score: ModeScore, mode: Mode): KeyFigure[] {
  const figs: KeyFigure[] = [];
  if (score.price_eur_m2 != null) figs.push({ label: "Prix médian", value: `${Math.round(score.price_eur_m2).toLocaleString("fr-FR")} €/m²` });
  const p = score.pillars.find((x) => x.pillar === MODE_KPI[mode].pillar && x.applicable);
  if (p) figs.push({ label: p.pillar.replace(/_/g, " "), value: p.native.label });
  return figs;
}

export default function CartePage() {
  const g = useGaia();
  const city = cityBySlug(useCityStore((s) => s.slug));
  const noun = city.zoneNoun;              // « freguesia » (PT) / « commune » (BE)
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const onSelectZone = (zoneId?: string) => {
    if (!zoneId) return;
    g.setFocusZone(zoneId);
    setDetailOpen(true);
  };

  // Arrivée depuis un chip d'objet ancré (lot C3) : focalise la maille demandée et
  // ouvre son détail, via le mécanisme de focus existant (aucun ajout côté carte).
  // Consommation UNIQUE au montage ; sans demande, rien ne change (rendu identique).
  useEffect(() => {
    const p = takePendingFocus();
    if (p && p.citySlug === city.slug && p.zoneId) {
      g.setFocusZone(p.zoneId);
      setDetailOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const panelZone = hover ?? g.focusZone;
  const q = g.quickFor(panelZone);

  // Actif vedette de la ville (miroir de showHaya sur Prix & marge) : le curseur
  // ne s'affiche que sur la zone de l'actif vedette, en résidentiel, panneau ouvert.
  const AssetSlider = city.promoAssetSlider ?? null;
  const showAsset =
    detailOpen && g.focusZone === city.promoAsset?.zoneId && g.assetClass === "residential" && !!g.hayaProps;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          marketLine={city.texts.marketLines.carte}
          freguesias={g.freguesias}
          selected={selected}
          onSelected={setSelected}
          mode={g.mode}
          onMode={g.setMode}
          assetClass={g.assetClass}
          onClass={g.setAssetClass}
        />

        <main className="relative min-h-0 flex-1 p-3">
          {/* isolate: contains Leaflet's composited (translate3d) panes in their own
              stacking context so Safari can never paint them above the fixed panels. */}
          <div className="absolute inset-3 isolate overflow-hidden rounded-2xl border border-navy/10 shadow-card">
            <GaiaMap
              scoresByNorm={g.scoresByNorm}
              selected={selected}
              onSelectZone={onSelectZone}
              onHoverZone={setHover}
              hayaNorm={g.hayaNorm}
              assetName={city.promoAsset?.displayName}
              mode={g.mode}
              focusZoneId={g.focusZone}
            />
          </div>

          {/* floating legend */}
          <div className="absolute bottom-7 left-7 z-[500] w-[360px] max-w-[70vw]">
            <MapLegendBar min={g.scoreRange.min} max={g.scoreRange.max} />
          </div>

          {/* floating compact zone panel */}
          {q && (
            <div className="group/sig absolute right-7 top-7 z-[500] w-72 rounded-2xl border border-gold/40 bg-navy p-4 text-cream shadow-card fade-up">
              {/* Signalement au survol (lot C3) : ancré à la maille affichée. */}
              <SignalAffordance
                citySlug={city.slug}
                place="br"
                anchor={{ kind: "zone", label: q.name, zoneId: panelZone, route: "/gaia" }}
              />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-label uppercase tracking-widest text-gold/90">{q.level === "municipio" ? "Vue ville" : Noun}</div>
                  <div className="font-display text-[17px] leading-tight">{q.name}</div>
                </div>
                <ScoreDial score={q.total} size={52} />
              </div>
              <div className="mt-2">
                <VerdictBadge mode={g.mode} verdict={q.verdict} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Stat label="Prix médian" value={q.price != null ? `${Math.round(q.price).toLocaleString("fr-FR")} €/m²` : "–"} />
                <Stat label="Croissance" value={q.yoy != null ? `${fmtSigned(q.yoy, 1)}%` : "–"} />
                <Stat label={q.extra.label} value={q.extra.value} />
                <Stat label={q.kpiLabel} value={q.kpiValue ?? "–"} />
              </div>
              <div className="mt-3 text-label text-cream/60">Survolez une {noun} · cliquez pour le détail</div>
            </div>
          )}
        </main>
      </div>

      <DetailPanel
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        score={g.detailScore}
        mode={g.mode}
        keyFigures={g.detailScore ? detailFigures(g.detailScore, g.mode) : []}
        haya={g.hayaProps}
        assetSlider={showAsset ? AssetSlider : null}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-2.5">
      <div className="text-label uppercase tracking-wide text-cream/70">{label}</div>
      <div className="font-display text-[16px] leading-tight text-cream">{value}</div>
    </div>
  );
}
