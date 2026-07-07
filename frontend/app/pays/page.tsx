"use client";

// Choix du pays (étape 1) : carte blueprint (lot 2). Le composant tient les deux
// étapes (pays puis ville, fly-to continu) ; la sélection ville est découplée de
// la navigation (onCitySelected), pour que le lot 3 puisse intercaler la
// révélation. Carte rendue client uniquement (ssr:false).

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

export default function PaysPage() {
  const router = useRouter();
  const setSlug = useCityStore((s) => s.setSlug);
  const onCitySelected = (slug: string) => {
    setSlug(slug);
    router.push(DASHBOARD_HOME);
  };
  return (
    <EntryShell bleed>
      <BlueprintMap initialStep="country" onCitySelected={onCitySelected} />
    </EntryShell>
  );
}
