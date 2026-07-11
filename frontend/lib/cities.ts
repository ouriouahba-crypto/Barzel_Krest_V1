// Registre frontend des villes : miroir de backend/data/cities/registry.json
// (les slugs DOIVENT correspondre ; GET /api/cities sert le registre backend).
// Chaque ville lie ses régimes Fiscalité et Énergie (modules + simulateurs) :
// Bruxelles branchera un module fiscal/énergie BE de même interface sans
// toucher les pages. Villes : Gaia + Lisbonne (lot 2a).

import type { ComponentType } from "react";
import * as fiscalPT from "./fiscal";
import * as energiePT from "./energie";
import * as fiscalBE from "./fiscalBE";
import * as energieBE from "./energieBE";
import type { RegimeFiscal, RegimeEnergie } from "./regimes";
import { AcquisitionSimulator } from "@/components/AcquisitionSimulator";
import { RetrofitSimulator } from "@/components/RetrofitSimulator";
import { HayaSlider } from "@/components/HayaSlider";
import { FabricaSlider } from "@/components/FabricaSlider";
import { DansaertSlider } from "@/components/DansaertSlider";
import { CampanhaSlider } from "@/components/CampanhaSlider";

export type AnalystIcon = "pin" | "building" | "layers" | "bolt" | "compare";

export interface CityTexts {
  /** lignes marché du Header, par page */
  marketLines: {
    carte: string; vueEnsemble: string; comparer: string; prixMarge: string;
    rendement: string; arbitrage: string; foncier: string; iaAnalyste: string;
  };
  /** contexte promotion résidentiel (prix-marge) quand il nomme la ville */
  promoContextResidential: string;
  /** overrides des lignes de régime quand elles nomment la ville */
  fiscaliteMarketLine?: string;
  energieMarketLine?: string;
  energieIntro?: string;
  /** IA Analyste : suggestions propres à la ville */
  analystSuggestions: { q: string; icon: AnalystIcon }[];
  /** légende du curseur d'actif vedette (page Prix & marge ; absente si la ville
   *  n'a pas encore d'actif vedette, lot 2b) */
  promoAssetCaption?: string;
  /** complément du gabarit « marché sélectif » de la bannière Prix & marge
   *  (« de la capitale » à Lisbonne) ; absent = « de la ville » */
  promoSelectiveRest?: string;
  /** clause signature du piège du yield (insight détention) */
  yieldTrapClause?: string;
  /** note d'analyse dédiée sous le tableau Rendement (prioritaire sur l'auto) */
  detentionNote?: string;
}

export interface CityDef {
  slug: string;
  label: string;
  country: "pt" | "be";
  currency: string;
  fiscalLocale: string;
  /** zone id du municipio (vue « ville » du moteur) */
  cityZoneId: string;
  /** position géographique [lng, lat] : marqueur de la carte blueprint (lot 2).
   *  Data-driven ici, jamais en dur dans le composant carte. */
  coords: [number, number];
  /** contours des freguesias/communes */
  geojson: string;
  /** terme de maille de la ville : « freguesia » (PT), « commune » (BE). Pilote
   *  tous les libellés de maille de l'UI (tableaux, placeholders, textes). */
  zoneNoun: string;
  zoneNounPlural: string;
  /** freguesia/commune par défaut du simulateur énergie */
  energieDefaultZone: string;
  /** régime fiscal de la ville : barèmes, volets, insight (PT ou BE, même contrat) */
  fiscal: RegimeFiscal;
  /** simulateur d'acquisition (curseur) : optionnel ; absent pour Bruxelles (lot 2b-ii) */
  fiscalSimulator?: ComponentType<{ residential: boolean }>;
  /** régime énergie : échelle (SCE / PEB), parc, frise réglementaire (PT ou BE) */
  energie: RegimeEnergie;
  /** simulateur de rénovation (curseur) : optionnel ; absent pour Bruxelles (lot 2b-ii) */
  retrofitSimulator?: typeof RetrofitSimulator;
  /** actif vedette promotion : nom API, freguesia/commune, curseur dédié.
   *  Absent tant que la ville n'a pas d'actif vedette (Bruxelles : lot 2b). */
  promoAsset?: { apiName: string; zoneId: string; displayName: string };
  promoAssetSlider?: typeof HayaSlider;
  texts: CityTexts;
}

export const CITIES: CityDef[] = [
  {
    slug: "gaia",
    label: "Vila Nova de Gaia",
    country: "pt",
    currency: "EUR",
    fiscalLocale: "pt-PT",
    cityZoneId: "vilanovadegaia",
    coords: [-8.611, 41.124],
    geojson: "/geo/gaia/freguesias.geojson",
    zoneNoun: "freguesia",
    zoneNounPlural: "freguesias",
    energieDefaultZone: "santamarinhaesaopedrodaafurada",
    fiscal: fiscalPT,
    fiscalSimulator: AcquisitionSimulator,
    energie: energiePT,
    retrofitSimulator: RetrofitSimulator,
    promoAsset: { apiName: "haya", zoneId: "santamarinhaesaopedrodaafurada", displayName: "Haya Towers" },
    promoAssetSlider: HayaSlider,
    texts: {
      // Lignes historiques de Gaia, déplacées verbatim depuis les pages.
      marketLines: {
        carte: "cx.gaia.mkt.carte",
        vueEnsemble: "cx.gaia.mkt.vueEnsemble",
        comparer: "cx.gaia.mkt.comparer",
        prixMarge: "cx.gaia.mkt.prixMarge",
        rendement: "cx.gaia.mkt.rendement",
        arbitrage: "cx.gaia.mkt.arbitrage",
        foncier: "cx.gaia.mkt.foncier",
        iaAnalyste: "cx.gaia.mkt.iaAnalyste",
      },
      promoContextResidential:
        "cx.gaia.promoContext",
      promoAssetCaption:
        "cx.gaia.promoCaption",
      // Copie Fiscalité/Énergie propre à Gaia (rive sud du Douro) : déplacée
      // verbatim du régime PT partagé, désormais neutre (aucune fuite d'identité).
      fiscaliteMarketLine:
        "cx.gaia.fiscalMkt",
      energieMarketLine:
        "cx.gaia.energieMkt",
      energieIntro:
        "cx.gaia.energieIntro",
      analystSuggestions: [
        { q: "cx.gaia.suggest1", icon: "pin" },
        { q: "cx.gaia.suggest2", icon: "building" },
        { q: "cx.gaia.suggest3", icon: "layers" },
        { q: "cx.gaia.suggest4", icon: "bolt" },
        { q: "cx.gaia.suggest5", icon: "compare" },
      ],
    },
  },
  {
    // Lisbonne, lot 2a : branchement mécanique (INE 2025-Q4 + params V0).
    // Textes V0 neutres et factuels, à réécrire en 2b.
    slug: "lisbonne",
    label: "Lisbonne",
    country: "pt",
    currency: "EUR",
    fiscalLocale: "pt-PT",
    cityZoneId: "lisboa",
    coords: [-9.1393, 38.7223],
    geojson: "/geo/lisbonne/freguesias.geojson",
    zoneNoun: "freguesia",
    zoneNounPlural: "freguesias",
    energieDefaultZone: "santamariamaior",
    fiscal: fiscalPT,
    fiscalSimulator: AcquisitionSimulator,
    energie: energiePT,
    retrofitSimulator: RetrofitSimulator,
    promoAsset: { apiName: "fabrica", zoneId: "marvila", displayName: "Formoso" },
    promoAssetSlider: FabricaSlider,
    texts: {
      // Textes calibrés lot 2b : la signature capitale (foncier rare, marge à
      // l'arc oriental, yield facial touristique non institutionnel).
      marketLines: {
        carte: "cx.lisbonne.mkt.carte",
        vueEnsemble: "cx.lisbonne.mkt.vueEnsemble",
        comparer: "cx.lisbonne.mkt.comparer",
        prixMarge: "cx.lisbonne.mkt.prixMarge",
        rendement: "cx.lisbonne.mkt.rendement",
        arbitrage: "cx.lisbonne.mkt.arbitrage",
        foncier: "cx.lisbonne.mkt.foncier",
        iaAnalyste: "cx.lisbonne.mkt.iaAnalyste",
      },
      promoContextResidential:
        "cx.lisbonne.promoContext",
      promoAssetCaption:
        "cx.lisbonne.promoCaption",
      promoSelectiveRest: "cx.lisbonne.selectiveRest",
      yieldTrapClause:
        "cx.lisbonne.yieldTrap",
      detentionNote:
        "cx.lisbonne.detentionNote",
      fiscaliteMarketLine:
        "cx.lisbonne.fiscalMkt",
      energieMarketLine:
        "cx.lisbonne.energieMkt",
      energieIntro:
        "cx.lisbonne.energieIntro",
      analystSuggestions: [
        { q: "cx.lisbonne.suggest1", icon: "pin" },
        { q: "cx.lisbonne.suggest2", icon: "building" },
        { q: "cx.lisbonne.suggest3", icon: "layers" },
        { q: "cx.lisbonne.suggest4", icon: "bolt" },
        { q: "cx.lisbonne.suggest5", icon: "compare" },
      ],
    },
  },
  {
    // Porto, lot 2a : branchement mécanique (INE 12 mois à décembre 2025 + params
    // V0 génératifs). Régime PT réutilisé (Fiscalité/Énergie de Lisbonne).
    // Lot 2b : calibration signature Campanha (arc de regeneration est) + actif
    // vedette Campanha Souto de Moura (projet mixte, ancre residentiel).
    slug: "porto",
    label: "Porto",
    country: "pt",
    currency: "EUR",
    fiscalLocale: "pt-PT",
    cityZoneId: "porto",
    coords: [-8.611, 41.1496],
    geojson: "/geo/porto/freguesias.geojson",
    zoneNoun: "freguesia",
    zoneNounPlural: "freguesias",
    energieDefaultZone: "cedofeitavitoria",
    fiscal: fiscalPT,
    fiscalSimulator: AcquisitionSimulator,
    energie: energiePT,
    retrofitSimulator: RetrofitSimulator,
    // Actif vedette (lot 2b) : projet mixte signe Souto de Moura a Campanha, ancre
    // sur sa composante residentielle (arc de regeneration est, freguesia Campanha).
    promoAsset: { apiName: "campanha", zoneId: "campanha", displayName: "Campanha Souto de Moura" },
    promoAssetSlider: CampanhaSlider,
    texts: {
      marketLines: {
        carte: "cx.porto.mkt.carte",
        vueEnsemble: "cx.porto.mkt.vueEnsemble",
        comparer: "cx.porto.mkt.comparer",
        prixMarge: "cx.porto.mkt.prixMarge",
        rendement: "cx.porto.mkt.rendement",
        arbitrage: "cx.porto.mkt.arbitrage",
        foncier: "cx.porto.mkt.foncier",
        iaAnalyste: "cx.porto.mkt.iaAnalyste",
      },
      promoContextResidential:
        "cx.porto.promoContext",
      promoAssetCaption:
        "cx.porto.promoCaption",
      promoSelectiveRest: "cx.porto.selectiveRest",
      // Copie Fiscalité/Énergie propre à Porto (concelho, arc est / centre
      // historique) : sinon la ville hérite du repli PT neutre. Aucune fuite Gaia.
      fiscaliteMarketLine:
        "cx.porto.fiscalMkt",
      energieMarketLine:
        "cx.porto.energieMkt",
      energieIntro:
        "cx.porto.energieIntro",
      analystSuggestions: [
        { q: "cx.porto.suggest1", icon: "pin" },
        { q: "cx.porto.suggest2", icon: "pin" },
        { q: "cx.porto.suggest3", icon: "building" },
        { q: "cx.porto.suggest4", icon: "layers" },
        { q: "cx.porto.suggest5", icon: "compare" },
      ],
    },
  },
  {
    // Bruxelles : dataset simulé ancré + scoring générique (lot 2a). Maille =
    // commune (19 communes de la Région de Bruxelles-Capitale).
    // Régime fiscal/énergie BE RÉEL (lot 2b-i, display seulement) : droits
    // d'enregistrement 12,5%, TVA neuf 21%, précompte, ISoc 25% côté Fiscalité ;
    // PEB A-G, PEB 275 en 2033 / PEB 150 vers 2045, Renolution côté Énergie.
    // Les simulateurs interactifs (curseurs) restent un lot 2b-ii : absents ici.
    // Pas d'actif vedette (promoAsset absent) ni de municipio agrégé : lot 2b-ii.
    slug: "bruxelles",
    label: "Bruxelles",
    country: "be",
    currency: "EUR",
    fiscalLocale: "fr-BE",
    // Pas de municipio : commune représentative pour la vue par défaut de la Carte.
    cityZoneId: "ixelles",
    coords: [4.3517, 50.8503],
    geojson: "/geo/bruxelles/freguesias.geojson",
    zoneNoun: "commune",
    zoneNounPlural: "communes",
    energieDefaultZone: "ixelles",
    fiscal: fiscalBE,
    // fiscalSimulator omis (curseur = lot 2b-ii) : la page rend la table de contrôle seule.
    energie: energieBE,
    // retrofitSimulator omis (curseur = lot 2b-ii) : la page rend la frise + le parc seuls.
    // Actif vedette (lot 2b-ii) : conversion bureau vers résidentiel au canal / Dansaert.
    promoAsset: { apiName: "dansaert", zoneId: "molenbeeksaintjean", displayName: "Dansaert Quai" },
    promoAssetSlider: DansaertSlider,
    texts: {
      // Textes V0 neutres et factuels (le terme de maille dit « commune »),
      // à réécrire en 2b avec la signature bruxelloise.
      marketLines: {
        carte: "cx.bruxelles.mkt.carte",
        vueEnsemble: "cx.bruxelles.mkt.vueEnsemble",
        comparer: "cx.bruxelles.mkt.comparer",
        prixMarge: "cx.bruxelles.mkt.prixMarge",
        rendement: "cx.bruxelles.mkt.rendement",
        arbitrage: "cx.bruxelles.mkt.arbitrage",
        foncier: "cx.bruxelles.mkt.foncier",
        iaAnalyste: "cx.bruxelles.mkt.iaAnalyste",
      },
      promoContextResidential:
        "cx.bruxelles.promoContext",
      promoAssetCaption:
        "cx.bruxelles.promoCaption",
      promoSelectiveRest: "cx.bruxelles.selectiveRest",
      analystSuggestions: [
        { q: "cx.bruxelles.suggest1", icon: "pin" },
        { q: "cx.bruxelles.suggest2", icon: "building" },
        { q: "cx.bruxelles.suggest3", icon: "layers" },
        { q: "cx.bruxelles.suggest4", icon: "bolt" },
        { q: "cx.bruxelles.suggest5", icon: "compare" },
      ],
    },
  },
];

export const DEFAULT_CITY = CITIES[0];

export function cityBySlug(slug: string): CityDef {
  return CITIES.find((c) => c.slug === slug) ?? DEFAULT_CITY;
}

// Couche d'entrée : parcours pays puis ville. Le pays est le pays du registre
// (`country`), jamais codé en dur ; la liste des villes d'un pays se dérive de
// CITIES. Ajouter une ville au registre suffit à la faire apparaître ici.
export type CountryCode = CityDef["country"];

export const COUNTRY_LABEL: Record<CountryCode, string> = {
  pt: "Portugal",
  be: "Belgique",
};

// Identifiant numérique ISO 3166-1 des pays dans world-atlas (countries-50m) :
// Portugal 620 (PRT), Belgique 056 (BEL). Sert à isoler les features du pays sur
// la carte blueprint (lot 2). Data-driven ici, pas en dur dans le composant.
export const COUNTRY_GEO_ID: Record<CountryCode, string> = {
  pt: "620",
  be: "056",
};

export interface CountryDef {
  code: CountryCode;
  label: string;
  cities: CityDef[];
}

// Pays groupés dans l'ordre de première apparition au registre (Portugal puis
// Belgique), chacun avec ses villes dans l'ordre du registre.
export const COUNTRIES: CountryDef[] = (() => {
  const order: CountryCode[] = [];
  const byCode = new Map<CountryCode, CityDef[]>();
  for (const c of CITIES) {
    if (!byCode.has(c.country)) {
      byCode.set(c.country, []);
      order.push(c.country);
    }
    byCode.get(c.country)!.push(c);
  }
  return order.map((code) => ({ code, label: COUNTRY_LABEL[code], cities: byCode.get(code)! }));
})();

export function citiesForCountry(code: CountryCode | null | undefined): CityDef[] {
  if (!code) return [];
  return COUNTRIES.find((c) => c.code === code)?.cities ?? [];
}

export function countryOf(slug: string): CountryCode {
  return cityBySlug(slug).country;
}

export function isCountryCode(v: string | null | undefined): v is CountryCode {
  return v === "pt" || v === "be";
}
