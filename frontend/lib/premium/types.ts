export type TierKey = "standard" | "upper" | "prime" | "ultra";

export type VatRegime = "PT" | "BE";

export type VatBasis = "pt_threshold" | "be_btr" | "be_sale";

export type DriverKey =
  | "waterfront"
  | "heritage"
  | "view"
  | "signature"
  | "landScarcity"
  | "connectivity"
  | "energyStandard"
  | "foreignDemand"
  | "taxRegime";

export type DriverNature = "structural" | "cyclical";

export interface PremiumTier {
  key: TierKey;
  pricePerSqm: number;
  capexPerSqm: number;
  landPerSqm: number;
  marketingRate: number;
  referenceAreaSqm: number;
  absorptionMonths: number;
  vatBasis: VatBasis;
}

export interface PremiumPocket {
  key: string;
  name: string;
  pricePerSqm: number;
  depthUnitsPerYear: number;
  drivers: DriverKey[];
}

export interface PremiumAsset {
  key: string;
  name: string;
  tier: TierKey;
  pricePerSqm: number;
  areaMinSqm: number;
  areaMaxSqm: number;
}

export interface SustainabilityDriver {
  key: DriverKey;
  nature: DriverNature;
  weight: number;
}

export interface PremiumCity {
  city: string;
  vatRegime: VatRegime;
  vatThresholdEur: number | null;
  vatReduced: number;
  vatStandard: number;
  carryRate: number;
  carryReferenceMonths: number;
  medianPricePerSqm: number;
  referencePricePerSqm: number;
  recommendedTier: TierKey;
  ceilingTier: TierKey;
  tiers: PremiumTier[];
  pockets: PremiumPocket[];
  assets: PremiumAsset[];
  sustainability: SustainabilityDriver[];
}

export interface TierComputation {
  key: TierKey;
  pricePerSqm: number;
  capexPerSqm: number;
  landPerSqm: number;
  referenceUnitPriceEur: number;
  vatRate: number;
  vatPerSqm: number;
  marketingPerSqm: number;
  grossMarginPerSqm: number;
  grossMarginRate: number;
  absorptionMonths: number;
  carryPerSqm: number;
  adjustedMarginPerSqm: number;
  adjustedMarginRate: number;
  aboveCeiling: boolean;
}

export interface CityComputation {
  city: string;
  pivotAreaSqm: number | null;
  structuralShare: number;
  cyclicalShare: number;
  tiers: TierComputation[];
}
