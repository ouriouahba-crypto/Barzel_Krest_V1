"use client";

// Hooks clients de l'i18n. useT() retourne t(key, params?) : dictionnaire de la
// langue courante -> repli EN -> repli cle brute, avec interpolation des tokens
// {x} par params[x]. En dev, une cle totalement absente est signalee une seule
// fois (jamais en prod).

import { useCallback } from "react";
import { useLangStore } from "@/lib/langStore";
import { dicts, DEFAULT_LANG } from "./index";
import { localeFor } from "./format";
import type { Lang } from "./types";

export function useLang(): Lang {
  return useLangStore((s) => s.lang);
}

export function useLocale(): string {
  return localeFor(useLangStore((s) => s.lang));
}

const warned = new Set<string>();

export function useT() {
  const lang = useLangStore((s) => s.lang);
  return useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let template = dicts[lang]?.[key];
      if (template == null) template = dicts[DEFAULT_LANG]?.[key];
      if (template == null) {
        if (process.env.NODE_ENV !== "production" && !warned.has(key)) {
          warned.add(key);
          console.warn(`[i18n] missing key: ${key}`);
        }
        template = key;
      }
      if (params) {
        return template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
      }
      return template;
    },
    [lang],
  );
}
