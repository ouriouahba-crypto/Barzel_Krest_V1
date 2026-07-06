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
    zoneNoun: "freguesia",
    zoneNounPlural: "freguesias",
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
      promoSelectiveRest: "de la capitale",
      yieldTrapClause:
        "Les yields faciaux les plus élevés (Santa Maria Maior, Misericórdia) sont touristiques : en zone de contention AL, ils ne sont pas représentatifs d'une détention institutionnelle.",
      detentionNote:
        "Santa Maria Maior et Misericórdia affichent les loyers faciaux les plus hauts de la ville mais un verdict Céder : la pression réglementaire municipale sur la location courte durée (zones de contention AL) rend le yield facial touristique non représentatif d'une détention institutionnelle. À l'autre bout du spectre, Parque das Nações et Avenidas Novas gardent des marchés profonds mais un yield net sous le plancher institutionnel de 3% : le rendement ne justifie plus la détention, et la fenêtre de cession est ouverte à Parque das Nações.",
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
        carte: "Concelho do Porto : 7 freguesias, du front de mer de la Foz au centre historique. La valeur de promotion se déplace vers l'arc de régénération est (Campanhã). Quatre lectures d'un même marché.",
        vueEnsemble: "Concelho do Porto : la marge de promotion se joue sur l'arc de régénération est (Campanhã), foncier le moins cher porté par un pipeline structurant, quand la Foz est plafonnée par un foncier cher. Quatre lectures d'un même marché.",
        comparer: "Concelho do Porto : un même territoire, quatre lectures (promotion, détention, arbitrage, foncier), freguesia par freguesia.",
        prixMarge: "Concelho do Porto : la marge de promotion se joue sur l'arc de régénération est (Campanhã), là où le foncier reste le moins cher et où un pipeline structurant soutient la sortie ; la Foz est plafonnée par un foncier cher.",
        rendement: "Concelho do Porto : loyers et charges réels. Conserver ne se justifie qu'au rendement net, après charges et fiscalité, sur le parc central profond.",
        arbitrage: "Concelho do Porto : les écarts de prix entre freguesias sont réels. Céder se juge sur la fenêtre, le spread réalisable et la profondeur d'acheteurs ; sur l'arc est, on construit plutôt qu'on ne cède.",
        foncier: "Concelho do Porto : la réserve à activer est sur l'arc de régénération est (Campanhã, Bonfim), portée par le nouveau terminal intermodal. Elle se juge à sa constructibilité, son usage et son horizon d'activation.",
        iaAnalyste: "Posez vos questions sur Porto : l'analyste répond à partir des scores, verdicts et cascades de la plateforme.",
      },
      promoContextResidential:
        "À Porto, la marge de promotion se déplace vers l'arc de régénération est : Campanhã porte le foncier le moins cher de la ville et un pipeline structurant (nouveau terminal intermodal, projet mixte Souto de Moura), quand la Foz reste plafonnée par un foncier cher qui écrase la marge malgré le prix.",
      promoAssetCaption:
        "Curseur temps réel sur l'actif K-REST à Campanhã (projet mixte Souto de Moura, composante résidentielle) : ajustez le prix de sortie pour voir la marge et le verdict se recalculer.",
      promoSelectiveRest: "de la ville",
      analystSuggestions: [
        { q: "Où lancer une promotion résidentielle à Porto ?", icon: "pin" },
        { q: "Pourquoi Campanhã ressort-elle en promotion malgré son prix bas ?", icon: "pin" },
        { q: "Faut-il conserver ou céder un actif résidentiel à Cedofeita ?", icon: "building" },
        { q: "Quel est le meilleur usage d'un terrain à Campanhã ?", icon: "layers" },
        { q: "Compare Paranhos et Ramalde en bureaux.", icon: "compare" },
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
        carte: "Région de Bruxelles-Capitale : marché à deux vitesses, l'arc du canal en mutation face au sud-est résidentiel plafonné. Dix-neuf communes, quatre lectures.",
        vueEnsemble: "Région de Bruxelles-Capitale : la valeur se crée sur l'arc du canal en mutation, pas dans le premium plafonné par un foncier cher. Quatre lectures d'un même marché.",
        comparer: "Région de Bruxelles-Capitale : un même territoire, quatre lectures (promotion, détention, arbitrage, foncier), commune par commune.",
        prixMarge: "Région de Bruxelles-Capitale : coûts de construction élevés et TVA sur le neuf. La marge de promotion se joue sur l'arc du canal (Molenbeek, Anderlecht, Forest), là où le foncier reste accessible.",
        rendement: "Région de Bruxelles-Capitale : précompte lourd et capex PEB sur le stock énergivore. Conserver ne se défend que sur le parc récent du sud-est, après charges et fiscalité.",
        arbitrage: "Région de Bruxelles-Capitale : le mur PEB 2033 décote l'énergivore. La fenêtre de cession s'ouvre là où acheter décoté, rénover et capturer le saut de classe reste rentable.",
        foncier: "Région de Bruxelles-Capitale : la réserve à activer est sur l'arc du canal en régénération. Elle se juge à sa constructibilité, son usage et son horizon d'activation.",
        iaAnalyste: "Posez vos questions sur Bruxelles : l'analyste répond à partir des scores, verdicts et cascades de la plateforme.",
      },
      promoContextResidential:
        "À Bruxelles, la marge de promotion est comprimée par des coûts de construction élevés et la TVA sur le neuf : elle se joue sur l'arc du canal en mutation (Molenbeek, Anderlecht, Forest), là où le foncier reste accessible et où la gentrification tire les prix de sortie, quand les communes premium sont plafonnées par un foncier cher.",
      promoAssetCaption:
        "Curseur temps réel sur l'actif K-REST au canal (Molenbeek) : ajustez le prix de sortie de la conversion pour voir la marge et le verdict se recalculer.",
      promoSelectiveRest: "de la Région",
      analystSuggestions: [
        { q: "Où lancer une promotion résidentielle à Bruxelles ?", icon: "pin" },
        { q: "Faut-il conserver ou céder un actif résidentiel à Ixelles ?", icon: "building" },
        { q: "Quel est le meilleur usage d'un terrain à Anderlecht ?", icon: "layers" },
        { q: "Quel impact la réglementation énergétique a-t-elle sur une détention à Schaerbeek ?", icon: "bolt" },
        { q: "Compare Ixelles et Uccle en bureaux.", icon: "compare" },
      ],
    },
  },
];

export const DEFAULT_CITY = CITIES[0];

export function cityBySlug(slug: string): CityDef {
  return CITIES.find((c) => c.slug === slug) ?? DEFAULT_CITY;
}
