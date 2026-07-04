// Registre frontend des villes : miroir de backend/data/cities/registry.json
// (les slugs DOIVENT correspondre ; GET /api/cities sert le registre backend).
// Chaque ville lie ses régimes Fiscalité et Énergie (modules + simulateurs) :
// Bruxelles branchera un module fiscal/énergie BE de même interface sans
// toucher les pages. Villes : Gaia + Lisbonne (lot 2a).

import type { ComponentType } from "react";
import * as fiscalPT from "./fiscal";
import * as energiePT from "./energie";
import { AcquisitionSimulator } from "@/components/AcquisitionSimulator";
import { RetrofitSimulator } from "@/components/RetrofitSimulator";
import { HayaSlider } from "@/components/HayaSlider";
import { FabricaSlider } from "@/components/FabricaSlider";

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
  /** légende du curseur d'actif vedette (page Prix & marge) */
  promoAssetCaption: string;
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
  /** contours des freguesias/communes */
  geojson: string;
  /** freguesia par défaut du simulateur énergie */
  energieDefaultZone: string;
  /** régime fiscal du pays : barèmes, volets, insight, simulateur */
  fiscal: typeof fiscalPT;
  fiscalSimulator: ComponentType<{ residential: boolean }>;
  /** régime énergie : échelle (SCE…), parc, frise réglementaire, simulateur */
  energie: typeof energiePT;
  retrofitSimulator: typeof RetrofitSimulator;
  /** actif vedette promotion : nom API, freguesia, curseur dédié */
  promoAsset: { apiName: string; zoneId: string; displayName: string };
  promoAssetSlider: typeof HayaSlider;
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
    geojson: "/geo/gaia/freguesias.geojson",
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
        carte: "Rive sud du Douro en forte progression, offre neuve rare côté fleuve.",
        vueEnsemble: "Rive sud du Douro : demande soutenue, offre neuve rare côté fleuve. Quatre lectures d'un même marché.",
        comparer: "Rive sud du Douro : un même territoire, quatre lectures (promotion, détention, arbitrage, foncier), côte à côte.",
        prixMarge: "Rive sud du Douro : offre neuve rare côté fleuve, coûts de construction maîtrisés. La marge de promotion se joue freguesia par freguesia.",
        rendement: "Rive sud du Douro : demande locative réelle, loyers en rattrapage. Conserver ne se justifie qu'au rendement net, après charges et fiscalité.",
        arbitrage: "Rive sud du Douro : le cycle a monté vite. Céder se joue sur la fenêtre, le spread réalisable et la profondeur d'acheteurs.",
        foncier: "Rive sud du Douro : le foncier bien desservi se raréfie. La réserve se juge à sa valeur résiduelle par usage et à son horizon d'activation.",
        iaAnalyste: "Posez vos questions sur Gaia : l'analyste répond à partir des scores, verdicts et cascades de la plateforme.",
      },
      promoContextResidential:
        "Le neuf se vend cher rive sud du Douro quand le foncier reste rare : la marge de promotion se décide surtout sur le coût du terrain, freguesia par freguesia.",
      promoAssetCaption:
        "Curseur temps réel sur l'actif K-REST à Afurada : ajustez le prix de vente pour voir la marge et le verdict se recalculer.",
      analystSuggestions: [
        { q: "Où lancer une promotion résidentielle à Gaia ?", icon: "pin" },
        { q: "Faut-il conserver ou céder un actif résidentiel à Madalena ?", icon: "building" },
        { q: "Quel est le meilleur usage d'un terrain à Canidelo ?", icon: "layers" },
        { q: "Quel impact la réglementation énergétique a-t-elle sur une détention à Santa Marinha ?", icon: "bolt" },
        { q: "Compare Santa Marinha et Madalena en bureaux.", icon: "compare" },
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
    geojson: "/geo/lisbonne/freguesias.geojson",
    energieDefaultZone: "santamariamaior",
    fiscal: fiscalPT,
    fiscalSimulator: AcquisitionSimulator,
    energie: energiePT,
    retrofitSimulator: RetrofitSimulator,
    promoAsset: { apiName: "fabrica", zoneId: "marvila", displayName: "Fábrica Oriente" },
    promoAssetSlider: FabricaSlider,
    texts: {
      // Textes calibrés lot 2b : la signature capitale (foncier rare, marge à
      // l'arc oriental, yield facial touristique non institutionnel).
      marketLines: {
        carte: "Rive nord du Tage : la capitale concentre la demande, le foncier rare arbitre entre patrimoine et régénération.",
        vueEnsemble: "Capitale au foncier rare : les beaux quartiers tiennent les prix, l'arc oriental porte la création de valeur. Quatre lectures d'un même marché.",
        comparer: "Rive nord du Tage : un même territoire, quatre lectures (promotion, détention, arbitrage, foncier), côte à côte.",
        prixMarge: "Capitale au foncier rare : la marge ne se joue pas dans les beaux quartiers mais là où le terrain reste accessible, à l'arc oriental en régénération.",
        rendement: "Les prix ont couru plus vite que les loyers : le net se défend dans le locatif domestique profond, pas dans le facial touristique du centre.",
        arbitrage: "Cycle haut, +12,3% sur un an : la fenêtre de cession est ouverte là où l'acheteur institutionnel est profond, sur le produit récent.",
        foncier: "Les réserves de la capitale sont à l'est et au nord : le centre patrimonial ne produit plus de terrain.",
        iaAnalyste: "Posez vos questions sur Lisbonne : l'analyste répond à partir des scores, verdicts et cascades de la plateforme.",
      },
      promoContextResidential:
        "Le foncier de marché du centre absorbe 60 à 70% du prix de sortie et écrase la marge : la promotion se décide à l'arc oriental (Marvila, Beato) et sur les réserves du nord, là où le terrain reste accessible.",
      promoAssetCaption:
        "Curseur temps réel sur l'actif K-REST à Marvila : ajustez le prix de sortie de la reconversion pour voir la marge et le verdict se recalculer.",
      yieldTrapClause:
        "Les yields faciaux les plus élevés (Santa Maria Maior, Misericórdia) sont touristiques : en zone de contention AL, ils ne sont pas représentatifs d'une détention institutionnelle.",
      detentionNote:
        "Santa Maria Maior et Misericórdia affichent les loyers faciaux les plus hauts de la ville mais un verdict Céder : la pression réglementaire municipale sur la location courte durée (zones de contention AL) rend le yield facial touristique non représentatif d'une détention institutionnelle.",
      fiscaliteMarketLine:
        "Portugal, rive nord du Tage : ce que le fisc prend à chaque étape, et comment c'est déjà intégré dans nos verdicts.",
      energieMarketLine:
        "Rive nord du Tage : ce que la réglementation énergétique va coûter au parc, où, et comment c'est déjà compté dans nos verdicts.",
      energieIntro:
        "La directive EPBD impose une trajectoire de rénovation au parc européen ; le certificat SCE (A+ → F) en est l'instrument portugais. Exposition du parc de Lisbonne, échéances, et coût d'une mise à niveau.",
      analystSuggestions: [
        { q: "Où lancer une promotion résidentielle à Lisbonne ?", icon: "pin" },
        { q: "Faut-il conserver ou céder un actif résidentiel à Arroios ?", icon: "building" },
        { q: "Quel est le meilleur usage d'un terrain à Marvila ?", icon: "layers" },
        { q: "Quel impact la réglementation énergétique a-t-elle sur une détention à Santa Maria Maior ?", icon: "bolt" },
        { q: "Compare Parque das Nações et Avenidas Novas en bureaux.", icon: "compare" },
      ],
    },
  },
];

export const DEFAULT_CITY = CITIES[0];

export function cityBySlug(slug: string): CityDef {
  return CITIES.find((c) => c.slug === slug) ?? DEFAULT_CITY;
}
