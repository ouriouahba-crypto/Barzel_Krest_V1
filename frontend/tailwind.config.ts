import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0A1628", 800: "#0F1E36", 700: "#16294A", 600: "#1E3559" },
        gold: { DEFAULT: "#C9A86A", 600: "#B8965A", 300: "#E0CBA0" },
        // DEFAULT reads the global CSS variable (app/globals.css) — one source.
        cream: { DEFAULT: "rgb(var(--cream) / <alpha-value>)", 200: "#FBF9F4" },
        ink: "#243447",
        muted: "#6B7A8D",
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
