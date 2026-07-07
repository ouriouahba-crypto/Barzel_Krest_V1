import type { Metadata } from "next";
import { Playfair_Display, Montserrat } from "next/font/google";
import "./globals.css";
import { CityKey } from "@/components/CityKey";
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
  description: "Intelligence immobilière par mode d'investissement.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${playfair.variable} ${montserrat.variable}`}>
      <body>
        <TransitionCurtain />
        <CityKey>{children}</CityKey>
      </body>
    </html>
  );
}
