import type {
  CityComputation,
  LandValueRow,
  PremiumCity,
  PremiumTier,
  TierComputation,
  TierKey,
} from "./types";

const TIER_ORDER: TierKey[] = ["standard", "upper", "prime", "ultra"];

function vatRateFor(city: PremiumCity, tier: PremiumTier, referenceUnitPriceEur: number): number {
  switch (tier.vatBasis) {
    case "pt_threshold":
      return city.vatThresholdEur !== null && referenceUnitPriceEur <= city.vatThresholdEur
        ? city.vatReduced
        : city.vatStandard;
    case "be_btr":
      return city.vatReduced;
    case "be_sale":
      return city.vatStandard;
  }
}

export function computeTier(city: PremiumCity, tier: PremiumTier): TierComputation {
  const referenceUnitPriceEur = tier.pricePerSqm * tier.referenceAreaSqm;
  const vatRate = vatRateFor(city, tier, referenceUnitPriceEur);
  const vatPerSqm = tier.capexPerSqm * vatRate;
  const marketingPerSqm = tier.pricePerSqm * tier.marketingRate;
  const grossMarginPerSqm =
    tier.pricePerSqm - tier.capexPerSqm - tier.landPerSqm - vatPerSqm - marketingPerSqm;
  const grossMarginRate = grossMarginPerSqm / tier.pricePerSqm;
  const carryBase = tier.capexPerSqm + tier.landPerSqm + vatPerSqm;
  const carryPerSqm =
    carryBase * city.carryRate * Math.max(0, (tier.absorptionMonths - city.carryReferenceMonths) / 12);
  const adjustedMarginPerSqm = grossMarginPerSqm - carryPerSqm;
  const adjustedMarginRate = adjustedMarginPerSqm / tier.pricePerSqm;
  const aboveCeiling = TIER_ORDER.indexOf(tier.key) > TIER_ORDER.indexOf(city.ceilingTier);

  return {
    key: tier.key,
    pricePerSqm: tier.pricePerSqm,
    capexPerSqm: tier.capexPerSqm,
    landPerSqm: tier.landPerSqm,
    referenceUnitPriceEur,
    vatRate,
    vatPerSqm,
    marketingPerSqm,
    grossMarginPerSqm,
    grossMarginRate,
    absorptionMonths: tier.absorptionMonths,
    carryPerSqm,
    adjustedMarginPerSqm,
    adjustedMarginRate,
    aboveCeiling,
  };
}

export function computeCity(city: PremiumCity): CityComputation {
  const pivotAreaSqm =
    city.vatRegime === "PT" && city.vatThresholdEur !== null
      ? city.vatThresholdEur / city.referencePricePerSqm
      : null;

  let structuralShare = 0;
  let cyclicalShare = 0;
  for (const driver of city.sustainability) {
    if (driver.nature === "structural") structuralShare += driver.weight;
    else cyclicalShare += driver.weight;
  }

  return {
    city: city.city,
    pivotAreaSqm,
    structuralShare,
    cyclicalShare,
    tiers: city.tiers.map((tier) => computeTier(city, tier)),
  };
}

export function pivotAreaForPrice(city: PremiumCity, pricePerSqm: number): number | null {
  if (city.vatRegime !== "PT" || city.vatThresholdEur === null) return null;
  return city.vatThresholdEur / pricePerSqm;
}

// Charge fonciere admissible (lot 6) : la question du promoteur detenteur de
// foncier n'est pas ou la marge est la plus grosse, mais combien il peut payer
// le terrain ici en tenant sa marge cible. C'est l'inversion de la cascade. Le
// portage depend du foncier, l'inconnue : l'equation se resout en forme fermee.

// Palier dont le prix est le plus proche du prix passe. En cas d'egalite exacte
// de distance, on retourne le palier d'index le plus bas dans l'ordre canonique
// standard, upper, prime, ultra (regle deterministe, pas un artefact de tri).
export function matchTier(city: PremiumCity, pricePerSqm: number): PremiumTier {
  let best = city.tiers[0];
  let bestDist = Math.abs(best.pricePerSqm - pricePerSqm);
  for (const tier of city.tiers) {
    const dist = Math.abs(tier.pricePerSqm - pricePerSqm);
    if (
      dist < bestDist ||
      (dist === bestDist && TIER_ORDER.indexOf(tier.key) < TIER_ORDER.indexOf(best.key))
    ) {
      best = tier;
      bestDist = dist;
    }
  }
  return best;
}

// Inversion de la cascade pour une poche, a un palier apparie et une marge cible.
// Depart : L = P - C - V - M - T - (C + L + V) * f, le portage porte aussi sur le
// foncier L. En isolant L on obtient la forme fermee ci-dessous. Aucun arrondi :
// la presentation appartient au composant. Les champs d'identite de la poche sont
// laisses vides ici et remplis par admissibleLandTable.
export function admissibleLandValue(
  city: PremiumCity,
  pricePerSqm: number,
  tier: PremiumTier,
  targetMarginRate: number
): LandValueRow {
  // TVA : meme logique de vatBasis que computeTier, mais en base pt_threshold le
  // seuil se teste sur le prix de la POCHE (pricePerSqm), pas sur celui du palier.
  const referenceUnitPriceEur = pricePerSqm * tier.referenceAreaSqm;
  const vatRate = vatRateFor(city, tier, referenceUnitPriceEur);
  const capexPerSqm = tier.capexPerSqm;
  const vatPerSqm = capexPerSqm * vatRate;
  const marketingPerSqm = pricePerSqm * tier.marketingRate;
  const targetMarginPerSqm = pricePerSqm * targetMarginRate;
  const carryFactor =
    city.carryRate * Math.max(0, (tier.absorptionMonths - city.carryReferenceMonths) / 12);
  const admissibleLandPerSqm =
    (pricePerSqm -
      capexPerSqm -
      vatPerSqm -
      marketingPerSqm -
      targetMarginPerSqm -
      (capexPerSqm + vatPerSqm) * carryFactor) /
    (1 + carryFactor);

  return {
    pocketKey: "",
    pocketName: "",
    pocketPricePerSqm: pricePerSqm,
    tierKey: tier.key,
    vatRate,
    vatPerSqm,
    capexPerSqm,
    marketingPerSqm,
    carryFactor,
    admissibleLandPerSqm,
    viable: admissibleLandPerSqm > 0,
  };
}

// Une ligne par poche, palier apparie par matchTier, triee par charge fonciere
// admissible decroissante.
export function admissibleLandTable(
  city: PremiumCity,
  targetMarginRate: number
): LandValueRow[] {
  return city.pockets
    .map((pocket) => {
      const tier = matchTier(city, pocket.pricePerSqm);
      const row = admissibleLandValue(city, pocket.pricePerSqm, tier, targetMarginRate);
      return { ...row, pocketKey: pocket.key, pocketName: pocket.name };
    })
    .sort((a, b) => b.admissibleLandPerSqm - a.admissibleLandPerSqm);
}
