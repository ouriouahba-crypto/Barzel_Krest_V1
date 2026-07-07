"use client";

// Enveloppe carte des écrans /pays et /villes (lot 4) : reprend le flux du lot 2
// (setSlug + navigation dashboard) mais l'habille d'une transition continue. À la
// sélection d'une ville : on lève le rideau navy (cover), puis, une fois le navy
// opaque, on pose la ville et on navigue SOUS le navy (le remontage de la carte par
// le changement de slug est ainsi invisible). Le dashboard entre en fondu (template)
// et le rideau se lève à l'arrivée. La carte du lot 2 n'est pas modifiée, seulement
// enveloppée. prefers-reduced-motion : setSlug + navigation immédiats.

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { EntryShell } from "./EntryShell";
import { useCityStore } from "@/lib/cityStore";
import { useTransition } from "@/lib/transitionStore";

const BlueprintMap = dynamic(() => import("./BlueprintMap"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-0 flex-1 items-center justify-center text-caption text-cream/50">Carte</div>
  ),
});

const DASHBOARD_HOME = "/vue-ensemble";
// Délai avant navigation : laisse le rideau navy devenir opaque (fondu 0.32s).
const COVER_MS = 360;

export function MapEntry({ initialStep }: { initialStep: "country" | "city" }) {
  const router = useRouter();
  const setSlug = useCityStore((s) => s.setSlug);
  const cover = useTransition((s) => s.cover);
  const reduce = useReducedMotion();

  const pick = (slug: string) => {
    if (reduce) {
      setSlug(slug);
      router.push(DASHBOARD_HOME);
      return;
    }
    cover();
    window.setTimeout(() => {
      setSlug(slug);
      router.push(DASHBOARD_HOME);
    }, COVER_MS);
  };

  return (
    <EntryShell bleed>
      <BlueprintMap initialStep={initialStep} onCitySelected={pick} />
    </EntryShell>
  );
}
