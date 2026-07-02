"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { InsightBanner } from "@/components/InsightBanner";
import { AcquisitionSimulator } from "@/components/AcquisitionSimulator";
import { useGaia } from "@/lib/useGaia";
import { classLabel } from "@/lib/scoring";
import { pmRows } from "@/lib/priceMargin";
import { rdRows } from "@/lib/rendement";
import {
  AIMI_COMPANY_PCT,
  IMI_MAX_PCT,
  IMI_MIN_PCT,
  IMT_COMMERCIAL_PCT,
  IMT_SECONDARY_2026,
  IRC_BASE_PCT,
  IRC_EFFECTIVE_PCT,
  SELO_PCT,
  acquisitionTaxes,
  fiscalInsight,
} from "@/lib/fiscal";

const MARKET_LINE =
  "Portugal, rive sud du Douro : ce que le fisc prend à chaque étape — et comment c'est déjà intégré dans nos verdicts.";

const eur = (v: number) => `${Math.round(v).toLocaleString("fr-FR")} €`;
const pct = (v: number, d = 1) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

// Fixed, verifiable checkpoints rendered from the same functions as the simulator.
const CHECKPOINTS = [400_000, 1_500_000, 4_000_000];

export default function FiscalitePage() {
  const g = useGaia();
  const [selected, setSelected] = useState<string[]>([]);
  const cls = g.assetClass;
  const residential = cls === "residential";

  // Banner sentence computed from the same engine-served rows as the mode pages.
  const pm = useMemo(() => pmRows(g.promoCity), [g.promoCity]);
  const rd = useMemo(() => rdRows(g.detentionCity), [g.detentionCity]);
  const sentence = useMemo(() => fiscalInsight(cls, pm, rd), [cls, pm, rd]);
  const entryMax = residential ? 7.5 + SELO_PCT : IMT_COMMERCIAL_PCT + SELO_PCT;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          marketLine={MARKET_LINE}
          freguesias={g.freguesias}
          selected={selected}
          onSelected={setSelected}
          mode="promotion"
          onMode={() => { /* page transverse */ }}
          assetClass={g.assetClass}
          onClass={g.setAssetClass}
          hideMode
        />

        <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
          {/* Module header */}
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-block h-5 w-1.5 rounded-full bg-gold" />
              <h2 className="font-display text-[22px] leading-none text-navy">Fiscalité</h2>
              <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[11px] font-medium text-gold-600">
                Portugal · {classLabel(cls)}
              </span>
            </div>
            <p className="mt-2 max-w-3xl pl-[18px] text-[13px] leading-relaxed text-muted">
              Acquérir, détenir, céder : les prélèvements portugais aux taux officiels 2026,
              et l'endroit exact où chacun est déjà compté dans les cascades de la plateforme.
            </p>
          </div>

          {/* Fiscal weight of the cycle */}
          <InsightBanner
            eyebrow={`Poids fiscal du cycle · ${classLabel(cls)}`}
            sentence={sentence}
            right={
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-cream/50">Frais d'entrée max</div>
                <div className="font-display text-[40px] leading-none text-gold">{pct(entryMax)}</div>
                <div className="text-[10px] text-cream/50">IMT + imposto do selo</div>
              </div>
            }
          />

          {/* Acquérir / Détenir / Céder */}
          <div className="grid shrink-0 grid-cols-1 gap-4 xl:grid-cols-3">
            <Volet title="Acquérir" eyebrow="À la signature">
              <Row
                label="IMT — habitation (investisseur)"
                value="1% → 8%"
                sub={`barème progressif ; taux uniques 6% puis 7,5% au-delà de ${(660_982).toLocaleString("fr-FR")} €`}
              />
              <Row
                label="IMT — commercial & terrains à bâtir"
                value={pct(IMT_COMMERCIAL_PCT)}
                sub="prédios não habitacionais : taux unique"
              />
              <Row label="Imposto do Selo" value={pct(SELO_PCT)} sub="sur le prix d'acquisition (verba 1.1)" />
              <Platform to="/prix-marge" label="intégré au coût du foncier de la cascade Prix & marge" />
            </Volet>

            <Volet title="Détenir" eyebrow="Chaque année">
              <Row
                label="IMI — prédios urbains"
                value={`${pct(IMI_MIN_PCT, 2)} – ${pct(IMI_MAX_PCT, 2)}`}
                sub="par an sur la VPT, taux fixé par la commune"
              />
              <Row
                label="AIMI — véhicule société"
                value={pct(AIMI_COMPANY_PCT)}
                sub="par an sur le patrimoine résidentiel détenu en société"
              />
              <Row
                label="IRC sur les loyers nets"
                value={pct(IRC_BASE_PCT, 0)}
                sub="véhicule société ; + derramas selon la commune"
              />
              <Platform to="/rendement" label="intégré à la ligne Fiscalité de la cascade Rendement" />
            </Volet>

            <Volet title="Céder" eyebrow="À la sortie">
              <Row
                label="Plus-values en IRC"
                value={pct(IRC_BASE_PCT, 0)}
                sub="résultat de cession imposé au taux IRC 2026"
              />
              <Row
                label="Derrama municipale & estadual"
                value="≤ 1,5% + prog."
                sub="selon la commune et le résultat"
              />
              <Row
                label="Taux effectif retenu"
                value={`~${pct(IRC_EFFECTIVE_PCT, 0)}`}
                sub="IRC + derramas — celui des verdicts de la plateforme"
              />
              <Platform to="/arbitrage" label="intégré aux frictions de sortie d'Arbitrage (et à la marge nette de Promotion)" />
            </Volet>
          </div>

          {/* Checkpoints + simulator */}
          <div className="grid shrink-0 grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr]">
            <section className="rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
              <h3 className="font-display text-[16px] leading-tight text-navy">
                Points de contrôle — {residential ? "habitation (investisseur)" : "commercial"}
              </h3>
              <p className="mt-0.5 text-[11px] text-muted">
                Mêmes formules que le simulateur ; chaque ligne est vérifiable sur le barème officiel.
              </p>
              <table className="mt-3 w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-navy/10 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">Prix d'acquisition</th>
                    <th className="px-3 py-2 text-right">IMT</th>
                    <th className="px-3 py-2 text-right">Imposto do selo</th>
                    <th className="px-3 py-2 text-right">Total entrée</th>
                    <th className="px-3 py-2 text-right">% du prix</th>
                  </tr>
                </thead>
                <tbody>
                  {CHECKPOINTS.map((p) => {
                    const t = acquisitionTaxes(p, residential);
                    return (
                      <tr key={p} className="border-b border-navy/[0.06]">
                        <td className="py-2.5 pr-3 font-medium text-ink">{eur(p)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink/80">{eur(t.imt)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink/80">{eur(t.selo)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-ink">{eur(t.total)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-display text-[15px] text-navy">{t.pct.toFixed(1)}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {residential && (
                <p className="mt-3 text-[11px] leading-snug text-muted">
                  Barème habitação secundária (continent) : {IMT_SECONDARY_2026.length - 2} tranches
                  marginales de 1% à 8% avec parcela a abater, puis taux uniques de 6% (660 982 –
                  1 150 853 €) et 7,5% au-delà.
                </p>
              )}
            </section>

            <div className="flex flex-col gap-2">
              <AcquisitionSimulator residential={residential} />
              <p className="px-1 text-[11px] leading-snug text-muted">
                Simulateur temps réel sur le barème en vigueur : déplacez le prix pour voir
                l'IMT, le selo et le total d'entrée se recalculer.
              </p>
            </div>
          </div>

          {/* Discreet source line */}
          <p className="shrink-0 pl-1 text-[11px] text-muted/80">
            Barèmes officiels PT 2026 — IMT (CIMT art. 17, tables du 06-01-2026), Imposto do Selo,
            IMI/AIMI, IRC (OE 2026).
          </p>
        </main>
      </div>
    </div>
  );
}

function Volet({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-2xl border border-navy/10 bg-white p-5 shadow-card">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gold-600">{eyebrow}</div>
      <h3 className="mt-0.5 font-display text-[18px] leading-tight text-navy">{title}</h3>
      <div className="mt-3 flex flex-1 flex-col divide-y divide-navy/[0.06]">{children}</div>
    </section>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-ink">{label}</div>
        {sub && <div className="text-[11px] leading-snug text-muted">{sub}</div>}
      </div>
      <div className="shrink-0 font-display text-[16px] text-navy">{value}</div>
    </div>
  );
}

function Platform({ to, label }: { to: string; label: string }) {
  return (
    <div className="mt-auto pt-3">
      <Link
        href={to}
        className="block rounded-xl border border-gold/30 bg-gold/[0.07] px-3 py-2 text-[11.5px] leading-snug text-gold-600 transition-colors hover:bg-gold/15"
      >
        <span className="font-semibold uppercase tracking-wide text-[10px]">Dans la plateforme</span>
        <br />
        {label} →
      </Link>
    </div>
  );
}
