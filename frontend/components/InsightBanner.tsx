"use client";

import React from "react";

// Wrap numeric tokens (with optional unit) in gold. Kept here so both pages share
// the exact same rendering of the verdict sentence.
function highlightNums(text: string) {
  const parts = text.split(/(\d[\d.,  ]*\s?(?:%|€\/m²|€|\/100)?)/g);
  return parts.map((p, i) =>
    /^\d/.test(p) ? (
      <span key={i} className="text-gold">
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

// Full-width navy verdict banner: eyebrow + Playfair sentence (numbers in gold) and
// an optional right block (best opportunity, marge max, …). Shared by the overview
// and Prix & marge pages.
export function InsightBanner({
  eyebrow,
  sentence,
  right,
}: {
  eyebrow: string;
  sentence: string;
  right?: React.ReactNode;
}) {
  return (
    <section className="flex shrink-0 items-center justify-between gap-6 rounded-2xl bg-navy px-7 py-6 shadow-card">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-gold/90">{eyebrow}</div>
        <p className="mt-2 max-w-4xl font-display text-[26px] leading-snug text-cream">{highlightNums(sentence)}</p>
      </div>
      {right && <div className="flex shrink-0 items-center gap-4 border-l border-white/10 pl-6">{right}</div>}
    </section>
  );
}
