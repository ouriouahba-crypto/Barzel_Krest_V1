import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0A1628", 800: "#0F1E36", 700: "#16294A", 600: "#1E3559" },
        // gold.700 : or lisible sur fond clair (≥ 4.5:1 sur blanc et cream) —
        // l'or brut C9A86A/B8965A est réservé aux fonds navy et au décoratif.
        gold: { DEFAULT: "#C9A86A", 600: "#B8965A", 700: "#85683A", 300: "#E0CBA0" },
        // DEFAULT reads the global CSS variable (app/globals.css) — one source.
        cream: { DEFAULT: "rgb(var(--cream) / <alpha-value>)", 200: "#FBF9F4" },
        // ink.soft : contenu secondaire sur fond clair (8.8:1 sur blanc) —
        // muted (#6B7A8D) est réservé aux étiquettes.
        ink: { DEFAULT: "#243447", soft: "#3D4C5F" },
        muted: "#6B7A8D",
      },
      // Échelle typographique Barzel — plancher absolu 12px (cf. CLAUDE.md charte).
      fontSize: {
        label: ["12px", { lineHeight: "1.35" }], // étiquettes, eyebrows, unités
        th: ["12.5px", { lineHeight: "1.35" }], // en-têtes de tableaux
        btn: ["13px", { lineHeight: "1.4" }], // boutons, contrôles
        td: ["13.5px", { lineHeight: "1.45" }], // cellules de tableaux
        caption: ["13px", { lineHeight: "1.5" }], // sous-titres de cartes, mentions
        body: ["14px", { lineHeight: "1.6" }], // corps, contexte, descriptions
        insight: ["15px", { lineHeight: "1.7" }], // insights, réponses analyste
        kpi: ["28px", { lineHeight: "1.1" }], // valeurs KPI (ex-26px)
        "kpi-sm": ["20px", { lineHeight: "1.2" }], // valeurs KPI compactes (ex-18px)
        "kpi-hero": ["44px", { lineHeight: "1" }], // chiffre héros des bandeaux (ex-40px)
      },
      fontFamily: {
        display: ["var(--font-playfair)", "Georgia", "serif"],
        sans: ["var(--font-montserrat)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(10,22,40,0.06), 0 8px 24px rgba(10,22,40,0.06)",
        panel: "-8px 0 24px rgba(10,22,40,0.10)",
      },
      transitionTimingFunction: { soft: "cubic-bezier(0.22, 1, 0.36, 1)" },
    },
  },
  plugins: [],
};
export default config;
