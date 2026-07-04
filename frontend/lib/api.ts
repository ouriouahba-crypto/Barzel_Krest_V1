// Thin client for the Barzel scoring API. Display responses carry no source /
// confidence fields (backend strips them): the front never surfaces them.

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
export interface ArbitrageBreakdown {
  prix_marche_eur_m2: number | null;       // reference (median) price
  valeur_realisable_eur_m2: number | null; // disposal value = marché × (1+spread)
  spread_pct: number;
  delai_cession_mois: number | null;       // 2-9 months, liquidity-driven
  frais_cession_pct: number;               // 2-4% of value
  decote_negociation_pct: number | null;   // grows with time on market
}
export interface LandbankUsage {
  label: string;                           // usage in French (résidentiel, bureaux…)
  prix_realisable_eur_m2: number;
  foncier_marche_eur_m2: number;           // the promotion land market for that usage
  valeur_residuelle_eur_m2: number;        // sale/(1,15 × pile de coûts) − construction
  uplift_pct: number;                      // vs foncier marché, bounded -40..+80
}
export interface LandbankBreakdown {
  constructibilite: number;
  meilleur_usage: string;                  // best usage (max uplift), French label
  prix_realisable_meilleur_usage_eur_m2: number;
  foncier_marche_eur_m2: number;
  valeur_residuelle_eur_m2: number;
  uplift_pct: number;
  usages: Record<string, LandbankUsage>;   // the 5 usages (interactive block)
  horizon_activation: string;              // immédiat / 2-4 ans / au-delà
}
export interface Pillar {
  pillar: string;
  subscore: number | null;
  native: PillarNative;
  why: string;
  weight: number;
  applicable: boolean;
  // promotion "marge" carries a MargeBreakdown; detention "rendement_net" a
  // RendementBreakdown; arbitrage "spread" an ArbitrageBreakdown; landbank
  // "constructibilite" a LandbankBreakdown.
  breakdown?: MargeBreakdown | RendementBreakdown | ArbitrageBreakdown | LandbankBreakdown;
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
  analystAsk: async (question: string, assetClass: string): Promise<{ answer: string }> => {
    const res = await fetch(`${BASE}/api/analyst/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, asset_class: assetClass }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
  },
  memoDraft: async (body: object): Promise<MemoDraft> => {
    const res = await fetch(`${BASE}/api/memo/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
  },
  memoTables: async (body: object): Promise<{ tables: MemoTables; meta: MemoDraft["meta"] }> => {
    const res = await fetch(`${BASE}/api/memo/tables`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
  },
  memoDraftSection: async (body: object): Promise<{ texte: string }> => {
    const res = await fetch(`${BASE}/api/memo/draft_section`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
  },
  memoRevise: async (body: object): Promise<{ texte: string }> => {
    const res = await fetch(`${BASE}/api/memo/revise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
  },
  memoRender: async (body: object): Promise<{ blob: Blob; filename: string }> => {
    const res = await fetch(`${BASE}/api/memo/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const dispo = res.headers.get("Content-Disposition") || "";
    const m = /filename="([^"]+)"/.exec(dispo);
    return { blob: await res.blob(), filename: m?.[1] ?? "Barzel_Memo.pdf" };
  },
};

export interface MemoTables {
  ville: { price: string; yoy: string; tx: string };
  scope_name: string | null;
  modes: Record<string, {
    headers: string[];
    municipio: { score: number; verdict: string; native: string } | null;
    rows: { name: string; score: number; verdict: string; cols: string[]; is_scope: boolean }[];
  }>;
}
export interface MemoSections {
  executive_summary: string;
  lecture_par_mode: Record<string, string>;
  risques: string;
  recommandation: string;
}
export interface MemoDraft {
  sections: MemoSections;
  tables: MemoTables;
  meta: { scope: string; asset_class: string; modes: string[]; angle: string };
}
