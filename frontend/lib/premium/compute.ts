import type {
  CityComputation,
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
