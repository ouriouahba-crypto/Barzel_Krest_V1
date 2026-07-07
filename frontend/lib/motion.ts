// Config et primitives de micro-animation du dashboard (lot 5). Habillage pur :
// aucune donnée ni aucun calcul touché. Tout est réglable ici, et tout respecte
// prefers-reduced-motion (état final immédiat).
//
// RÈGLE D'OR : le count-up part d'une valeur basse et FINIT EXACTEMENT sur la
// vraie valeur (dernier setVal = target), au format existant du composant appelant.

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Réglages Ouri : durées (ms), stagger, et interrupteurs par catégorie d'effet.
export const MOTION = {
  countUpMs: 850,
  revealMs: 500,
  staggerMs: 70,
  enableCountUp: true,
  enableStagger: true,
  enableCharts: true,
  enableTitleReveal: true,
  // La police de marque (Playfair Display) est conservée : pas de police variable
  // introduite. Passe à true seulement si Ouri veut expérimenter une variable.
  enableVariableFont: false,
};

export const EASE_SOFT: [number, number, number, number] = [0.22, 1, 0.36, 1];
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const useIsoLayout = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(m.matches);
    const h = () => setReduce(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return reduce;
}

// Count-up rAF vers `target`. Le rendu SSR / premier rendu client vaut `target`
// (aucune divergence d'hydratation) ; en layout effect (avant paint) on repart de
// 0 puis on interpole. Toujours terminé exactement sur `target`.
export function useCountUp(target: number, opts?: { duration?: number; enabled?: boolean }): number {
  const duration = opts?.duration ?? MOTION.countUpMs;
  const cfgEnabled = opts?.enabled ?? MOTION.enableCountUp;
  const [val, setVal] = useState(target);
  const fromRef = useRef(0);
  const firstRef = useRef(true);
  const rafRef = useRef<number | null>(null);

  useIsoLayout(() => {
    const reduce =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!cfgEnabled || reduce) {
      firstRef.current = false;
      fromRef.current = target;
      setVal(target);
      return;
    }
    const from = firstRef.current ? 0 : fromRef.current;
    firstRef.current = false;
    setVal(from); // avant paint : premier cadre = valeur de départ, pas la finale
    const start = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      if (p < 1) {
        setVal(from + (target - from) * easeOutCubic(p));
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setVal(target); // fin exacte
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, cfgEnabled]);

  return val;
}
