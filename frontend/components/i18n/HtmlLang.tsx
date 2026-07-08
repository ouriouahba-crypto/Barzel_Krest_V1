"use client";

// Applique la langue courante a l'attribut <html lang>. Hydrate le langStore en
// useLayoutEffect (avant paint, meme modele que CityKey : le premier rendu client
// reste le defaut EN, identique au HTML serveur), puis reflete la langue sur
// document.documentElement.lang a chaque changement. Ne rend rien.

import { useEffect, useLayoutEffect } from "react";
import { useLangStore } from "@/lib/langStore";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function HtmlLang() {
  const lang = useLangStore((s) => s.lang);
  const hydrate = useLangStore((s) => s.hydrate);
  useIsoLayoutEffect(() => {
    hydrate();
  }, [hydrate]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return null;
}
