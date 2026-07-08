import type { Metadata } from "next";
import { Playfair_Display, Montserrat } from "next/font/google";
import "./globals.css";
import { CityKey } from "@/components/CityKey";
import { HtmlLang } from "@/components/i18n/HtmlLang";
import { TransitionCurtain } from "@/components/entry/TransitionCurtain";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-playfair",
  display: "swap",
});
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Barzel Analytics",
  description: "Real estate intelligence by investment mode.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${montserrat.variable}`}>
      <body>
        <HtmlLang />
        <TransitionCurtain />
        <CityKey>{children}</CityKey>
      </body>
    </html>
  );
}
