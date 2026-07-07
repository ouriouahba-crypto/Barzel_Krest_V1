"use client";

// Choix de la ville (étape 2) : même carte blueprint que /pays, ouverte
// directement sur le pays courant (store) zoomé, marqueurs villes posés. En repli
// (aucun pays choisi), la carte revient à l'étape pays. La sélection ville est
// découplée de la navigation (onCitySelected). Carte rendue client (ssr:false).

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { EntryShell } from "@/components/entry/EntryShell";
import { useCityStore } from "@/lib/cityStore";

const BlueprintMap = dynamic(() => import("@/components/entry/BlueprintMap"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-0 flex-1 items-center justify-center text-caption text-cream/50">Carte</div>
  ),
});

const DASHBOARD_HOME = "/vue-ensemble";

export default function VillesPage() {
  const router = useRouter();
  const setSlug = useCityStore((s) => s.setSlug);
  const onCitySelected = (slug: string) => {
    setSlug(slug);
    router.push(DASHBOARD_HOME);
  };
  return (
    <EntryShell bleed>
      <BlueprintMap initialStep="city" onCitySelected={onCitySelected} />
    </EntryShell>
  );
}
