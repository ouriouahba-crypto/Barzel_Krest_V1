import type { PremiumCity } from "./types";
import { gaia } from "./data/gaia";
import { porto } from "./data/porto";
import { lisbonne } from "./data/lisbonne";
import { bruxelles } from "./data/bruxelles";

export * from "./types";
export { computeTier, computeCity, pivotAreaForPrice } from "./compute";

export const PREMIUM_CITIES: Record<string, PremiumCity> = {
  gaia,
  porto,
  lisbonne,
  bruxelles,
};

export function getPremiumCity(slug: string): PremiumCity | null {
  return PREMIUM_CITIES[slug] ?? null;
}
