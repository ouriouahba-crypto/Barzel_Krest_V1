// Registre frontend des villes : miroir de backend/data/cities/registry.json
// (les slugs DOIVENT correspondre ; GET /api/cities sert le registre backend).
// Chaque ville lie ses régimes Fiscalité et Énergie (modules + simulateurs) :
// Bruxelles branchera un module fiscal/énergie BE de même interface sans
// toucher les pages. Gaia seule est enregistrée dans ce lot.

import type { ComponentType } from "react";
import * as fiscalPT from "./fiscal";
import * as energiePT from "./energie";
import { AcquisitionSimulator } from "@/components/AcquisitionSimulator";
import { RetrofitSimulator } from "@/components/RetrofitSimulator";

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
  /** régime fiscal du pays : barèmes, volets, insight, simulateur */
  fiscal: typeof fiscalPT;
  fiscalSimulator: ComponentType<{ residential: boolean }>;
  /** régime énergie : échelle (SCE…), parc, frise réglementaire, simulateur */
  energie: typeof energiePT;
  retrofitSimulator: typeof RetrofitSimulator;
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
    fiscal: fiscalPT,
    fiscalSimulator: AcquisitionSimulator,
    energie: energiePT,
    retrofitSimulator: RetrofitSimulator,
  },
];

export const DEFAULT_CITY = CITIES[0];

export function cityBySlug(slug: string): CityDef {
  return CITIES.find((c) => c.slug === slug) ?? DEFAULT_CITY;
}
