// Thin client for the Barzel scoring API. Display responses carry no source /
// confidence fields (backend strips them) — the front never surfaces them.

import type { Mode } from "./scoring";

const BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export interface PillarNative {
  value: number | string | null;
  unit: string;
  label: string;
}
export interface MargeBreakdown {
  base_median: number | null;          // existing-stock median (residential zone only)
  premium_pct: number | null;          // new-build premium % (residential zone only)
  realizable_sale: number;             // realizable / market sale €/m²
  net_sale: number;                    // sale net of VAT (recoverable for commercial)
  vat_pct: number;
  construction: number;                // €/m²
  land: number;                        // foncier €/m²
  soft: number;                        // frais annexes (dev cost stack) €/m²
  finance: number;                     // financing carry €/m²
  cost_total: number;                  // coût de revient €/m²
  margin_pct: number;
  premium_over_median_pct: number | null; // named-asset only
}
export interface RendementBreakdown {
  loyer_marche_eur_m2_an: number | null; // market rent €/m²/year
  yield_brut_pct: number;                // zone-adjusted gross yield
  charges_pct_loyer: number;             // charges + vacancy, as % of rent
  fiscalite_pct_loyer: number;           // holding tax, as % of rent
  yield_net_pct: number;
}
export interface Pillar {
  pillar: string;
  subscore: number | null;
  native: PillarNative;
  why: string;
  weight: number;
  applicable: boolean;
  // promotion "marge" pillar carries a MargeBreakdown; detention "rendement_net"
  // carries a RendementBreakdown.
  breakdown?: MargeBreakdown | RendementBreakdown;
}
export interface ScoreNativeIndicator {
  label: string;
}
export interface ModeScore {
  zone: string;
  zone_name: string;
  city: string;
  country: string;
  level: string;
  mode: Mode;
  asset_class: string;
  asset: string | null;
  median_eur_m2: number | null;
  price_eur_m2: number | null;
  yoy_pct: number | null;
  n_transactions: number | null;
  total: number;
  verdict: string;
  native_indicator: ScoreNativeIndicator;
  pillars: Pillar[];
}
export interface ZoneAllModes {
  zone: string;
  scores: Record<Mode, ModeScore>;
}
export interface CityResponse {
  city: string;
  mode: Mode;
  count: number;
  zones: ModeScore[];
}
export interface AssetResponse {
  asset: string;
  city: string;
  zone: string;
  class: string;
  primary_mode: Mode;
  scores: Record<Mode, ModeScore>;
  primary: ModeScore;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${path} ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  city: (city: string, mode: Mode, assetClass?: string) =>
    get<CityResponse>(
      `/api/scoring/city?city=${encodeURIComponent(city)}&mode=${mode}` +
        (assetClass ? `&class=${assetClass}` : "")
    ),
  zone: (zone: string, assetClass?: string) =>
    get<ZoneAllModes>(
      `/api/scoring/zone?zone=${encodeURIComponent(zone)}` +
        (assetClass ? `&class=${assetClass}` : "")
    ),
  zoneMode: (zone: string, mode: Mode, assetClass?: string) =>
    get<ModeScore>(
      `/api/scoring/zone?zone=${encodeURIComponent(zone)}&mode=${mode}` +
        (assetClass ? `&class=${assetClass}` : "")
    ),
  asset: (asset: string) => get<AssetResponse>(`/api/scoring/asset?asset=${asset}`),
};
