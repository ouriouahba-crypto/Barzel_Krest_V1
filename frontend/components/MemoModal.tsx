"use client";

import { useEffect, useState } from "react";
import { api, MemoDraft } from "@/lib/api";
import { getMemoDefaults } from "@/lib/session";
import { displayName } from "@/lib/useGaia";
import { ASSET_CLASSES, MODES, MODE_LABEL, Mode, classLabel, verdictLabel } from "@/lib/scoring";
import { cityBySlug } from "@/lib/cities";
import { useCityStore } from "@/lib/cityStore";

const ANGLES = [
  { value: "synthese", label: "Synthèse d'opportunités" },
  { value: "acquisition", label: "Note d'acquisition" },
  { value: "detention", label: "Revue de détention" },
];

const SECTION_LABELS: Record<string, string> = {
  executive_summary: "Synthèse exécutive",
  risques: "Risques (fiscalité & énergie)",
  recommandation: "Recommandation",
};

// Investment-memo generator: form → LLM draft review (editable narrative,
// read-only figures) → deterministic PDF render.
export function MemoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const city = cityBySlug(useCityStore((s) => s.slug));
  const [step, setStep] = useState<"form" | "review">("form");
  const [scope, setScope] = useState<string>("ville");
  const [assetClass, setAssetClass] = useState("residential");
  const [modes, setModes] = useState<Mode[]>([...MODES]);
  const [angle, setAngle] = useState("synthese");
  const [instructions, setInstructions] = useState("");
  const [fregs, setFregs] = useState<{ id: string; label: string }[]>([]);
  const [draft, setDraft] = useState<MemoDraft | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // "draft" | "render" | section id
  const [error, setError] = useState<string | null>(null);
  const [consignes, setConsignes] = useState<Record<string, string>>({});
  // Real per-step progress while drafting (sections are written in parallel).
  const [steps, setSteps] = useState<{ id: string; label: string; done: boolean }[]>([]);

  // Prefill from the page's current state each time the modal opens. The
  // freguesia list must not depend on the page: if the bridge hasn't published
  // one yet, fetch it from the engine so the dropdown always works.
  useEffect(() => {
    if (!open) return;
    const d = getMemoDefaults();
    setAssetClass(d.assetClass);
    if (d.freguesias.length) setFregs(d.freguesias);
    else
      api
        .city("gaia", "promotion", d.assetClass)
        .then((c) =>
          setFregs(
            c.zones
              .filter((z) => z.level !== "municipio")
              .map((z) => ({ id: z.zone, label: displayName(z.zone_name) }))
              .sort((a, b) => a.label.localeCompare(b.label))
          )
        )
        .catch(() => setFregs([]));
    // A freguesia focused on the page prefills the dropdown as the scope.
    setScope(d.focusZone !== d.cityZoneId ? d.focusZone : "ville");
    setModes([...MODES]);
    setAngle("synthese");
    setInstructions("");
    setDraft(null);
    setStep("form");
    setError(null);
    setConsignes({});
  }, [open]);

  if (!open) return null;

  const toggleMode = (m: Mode) =>
    setModes((cur) => (cur.includes(m) ? (cur.length > 1 ? cur.filter((x) => x !== m) : cur) : [...MODES].filter((x) => cur.includes(x) || x === m)));

  // Progressive draft: deterministic tables first, then every narrative section
  // in parallel; each step is checked off when its response actually lands.
  const doDraft = async () => {
    setBusy("draft");
    setError(null);
    const sectionIds = ["executive_summary", ...modes, "risques", "recommandation"];
    const labelOf = (id: string) =>
      id === "executive_summary" ? "Synthèse exécutive"
      : id === "risques" ? "Risques"
      : id === "recommandation" ? "Recommandation"
      : `Lecture ${MODE_LABEL[id as Mode]}`;
    setSteps([
      { id: "tables", label: `Analyse des ${modes.length} modes`, done: false },
      ...sectionIds.map((id) => ({ id, label: labelOf(id), done: false })),
    ]);
    const markDone = (id: string) => setSteps((s) => s.map((x) => (x.id === id ? { ...x, done: true } : x)));
    try {
      const body = { scope, asset_class: assetClass, modes, angle, instructions: instructions || undefined };
      const t = await api.memoTables(body);
      markDone("tables");
      const texts: Record<string, string> = {};
      await Promise.all(
        sectionIds.map((id) =>
          api.memoDraftSection({ ...body, section: id }).then((r) => {
            texts[id] = r.texte;
            markDone(id);
          })
        )
      );
      setDraft({
        sections: {
          executive_summary: texts.executive_summary,
          lecture_par_mode: Object.fromEntries(modes.map((m) => [m, texts[m]])),
          risques: texts.risques,
          recommandation: texts.recommandation,
        },
        tables: t.tables,
        meta: t.meta,
      });
      setStep("review");
    } catch {
      setError("Le rédacteur est momentanément indisponible.");
    } finally {
      setBusy(null);
      setSteps([]);
    }
  };

  const setSection = (id: string, mode: string | null, value: string) => {
    setDraft((d) => {
      if (!d) return d;
      const s = { ...d.sections };
      if (mode) s.lecture_par_mode = { ...s.lecture_par_mode, [mode]: value };
      else (s as any)[id] = value;
      return { ...d, sections: s };
    });
  };

  const doRevise = async (id: string, mode: string | null, current: string) => {
    const consigne = (consignes[mode ?? id] || "").trim();
    if (!consigne || !draft) return;
    setBusy(mode ?? id);
    setError(null);
    try {
      const r = await api.memoRevise({
        section_id: mode ? `lecture ${MODE_LABEL[mode as Mode]}` : id,
        texte_actuel: current,
        consigne,
        scope: draft.meta.scope,
        asset_class: draft.meta.asset_class,
      });
      setSection(id, mode, r.texte);
      setConsignes((c) => ({ ...c, [mode ?? id]: "" }));
    } catch {
      setError("Révision momentanément indisponible.");
    } finally {
      setBusy(null);
    }
  };

  const doRender = async () => {
    if (!draft) return;
    setBusy("render");
    setError(null);
    try {
      const { blob, filename } = await api.memoRender({
        sections: draft.sections,
        scope: draft.meta.scope,
        asset_class: draft.meta.asset_class,
        modes: draft.meta.modes,
        angle: draft.meta.angle,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Le rendu PDF est momentanément indisponible.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-navy/70 p-6" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-cream text-ink shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between bg-navy px-6 py-4 text-cream">
          <div>
            <div className="text-label font-semibold uppercase tracking-widest text-gold">Barzel Analytics</div>
            <div className="font-display text-[19px]">Mémo d'investissement</div>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-cream/60 transition-colors hover:bg-white/10 hover:text-cream">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {step === "form" && (
            <div className="flex flex-col gap-5">
              <Field label="Périmètre">
                <div className="flex flex-wrap items-center gap-2">
                  <Choice on={scope === "ville"} onClick={() => setScope("ville")} label={`Ville entière · ${city.label}`} />
                  <select
                    value={scope === "ville" ? "" : scope}
                    onChange={(e) => setScope(e.target.value || "ville")}
                    className={`rounded-xl border px-3 py-2 text-btn outline-none transition-colors ${
                      scope !== "ville" ? "border-gold/60 bg-gold/10 font-medium text-navy" : "border-navy/15 bg-white text-ink hover:border-gold/40"
                    }`}
                  >
                    <option value="">Une freguesia…</option>
                    {fregs.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </Field>
              <Field label="Classe d'actif">
                <div className="flex flex-wrap gap-2">
                  {ASSET_CLASSES.map((c) => (
                    <Choice key={c.value} on={assetClass === c.value} onClick={() => setAssetClass(c.value)} label={c.label} />
                  ))}
                </div>
              </Field>
              <Field label="Modes à inclure">
                <div className="flex flex-wrap gap-2">
                  {MODES.map((m) => (
                    <label key={m} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-btn transition-colors ${modes.includes(m) ? "border-gold/60 bg-gold/10 text-navy" : "border-navy/15 bg-white text-ink-soft"}`}>
                      <input type="checkbox" className="accent-[#B8965A]" checked={modes.includes(m)} onChange={() => toggleMode(m)} />
                      {MODE_LABEL[m]}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Angle">
                <div className="flex flex-wrap gap-2">
                  {ANGLES.map((a) => (
                    <Choice key={a.value} on={angle === a.value} onClick={() => setAngle(a.value)} label={a.label} />
                  ))}
                </div>
              </Field>
              <Field label="Instructions à l'analyste (optionnel)">
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Ex. : insiste sur Haya Towers, cadre pour un comité d'investissement…"
                  className="h-20 w-full rounded-xl border border-navy/15 bg-white px-3 py-2.5 text-body text-ink outline-none placeholder:text-muted/60 focus:border-gold/60"
                />
              </Field>

              {busy === "draft" && steps.length > 0 && (
                <div className="rounded-2xl border border-gold/30 bg-white p-4 shadow-card">
                  <div className="mb-2 text-label font-semibold uppercase tracking-widest text-gold-700">
                    Rédaction · {steps.filter((s) => s.done).length} / {steps.length}
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                    {steps.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 text-caption">
                        {s.done ? (
                          <span className="text-gold-700">✓</span>
                        ) : (
                          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-navy/25" />
                        )}
                        <span className={s.done ? "text-ink" : "text-ink-soft"}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === "review" && draft && (
            <div className="flex flex-col gap-5">
              <p className="text-caption text-ink-soft">
                Relisez et ajustez les textes : les chiffres, tableaux et verdicts sont injectés
                directement du moteur au rendu et ne sont pas modifiables.
              </p>

              <Section
                id="executive_summary" label={SECTION_LABELS.executive_summary}
                value={draft.sections.executive_summary} busy={busy}
                consigne={consignes["executive_summary"] ?? ""}
                onText={(v) => setSection("executive_summary", null, v)}
                onConsigne={(v) => setConsignes((c) => ({ ...c, executive_summary: v }))}
                onRevise={() => doRevise("executive_summary", null, draft.sections.executive_summary)}
              />

              {draft.meta.modes.map((m) => (
                <div key={m}>
                  <Section
                    id={m} label={`Lecture · ${MODE_LABEL[m as Mode]}`}
                    value={draft.sections.lecture_par_mode[m] ?? ""} busy={busy}
                    consigne={consignes[m] ?? ""}
                    onText={(v) => setSection("lecture_par_mode", m, v)}
                    onConsigne={(v) => setConsignes((c) => ({ ...c, [m]: v }))}
                    onRevise={() => doRevise("lecture_par_mode", m, draft.sections.lecture_par_mode[m] ?? "")}
                  />
                  <ModeTable draft={draft} mode={m} />
                </div>
              ))}

              <Section
                id="risques" label={SECTION_LABELS.risques}
                value={draft.sections.risques} busy={busy}
                consigne={consignes["risques"] ?? ""}
                onText={(v) => setSection("risques", null, v)}
                onConsigne={(v) => setConsignes((c) => ({ ...c, risques: v }))}
                onRevise={() => doRevise("risques", null, draft.sections.risques)}
              />
              <Section
                id="recommandation" label={SECTION_LABELS.recommandation}
                value={draft.sections.recommandation} busy={busy}
                consigne={consignes["recommandation"] ?? ""}
                onText={(v) => setSection("recommandation", null, v)}
                onConsigne={(v) => setConsignes((c) => ({ ...c, recommandation: v }))}
                onRevise={() => doRevise("recommandation", null, draft.sections.recommandation)}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-navy/10 bg-cream-200/60 px-6 py-4">
          <div className="text-caption italic text-[#9E5B5B]">{error}</div>
          <div className="flex items-center gap-3">
            {step === "review" && (
              <button onClick={() => setStep("form")} className="rounded-xl border border-navy/20 px-4 py-2.5 text-btn text-ink transition-colors hover:bg-white">
                ← Paramètres
              </button>
            )}
            {step === "form" ? (
              <button
                onClick={doDraft} disabled={busy === "draft"}
                className="rounded-xl border border-gold/50 bg-gold/15 px-5 py-2.5 text-btn font-medium text-gold-700 transition-colors hover:bg-gold/25 disabled:cursor-wait disabled:opacity-60"
              >
                {busy === "draft" ? "Rédaction en cours…" : "Rédiger le mémo"}
              </button>
            ) : (
              <button
                onClick={doRender} disabled={busy === "render"}
                className="rounded-xl bg-navy px-5 py-2.5 text-btn font-medium text-gold transition-colors hover:bg-navy-800 disabled:cursor-wait disabled:opacity-60"
              >
                {busy === "render" ? "Rendu du PDF…" : "Générer le PDF"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-label font-semibold uppercase tracking-widest text-muted">{label}</div>
      {children}
    </div>
  );
}

function Choice({ on, label, onClick, disabled }: { on: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      className={`rounded-xl border px-3 py-2 text-btn transition-colors ${
        on ? "border-gold/60 bg-gold/10 font-medium text-navy" : disabled ? "cursor-not-allowed border-navy/10 text-muted/50" : "border-navy/15 bg-white text-ink hover:border-gold/40"
      }`}
    >
      {label}
    </button>
  );
}

function Section({ id, label, value, consigne, busy, onText, onConsigne, onRevise }: {
  id: string; label: string; value: string; consigne: string; busy: string | null;
  onText: (v: string) => void; onConsigne: (v: string) => void; onRevise: () => void;
}) {
  const revising = busy === id;
  return (
    <div className="rounded-2xl border border-navy/10 bg-white p-4 shadow-card">
      <div className="mb-2 text-label font-semibold uppercase tracking-widest text-gold-700">{label}</div>
      <textarea
        value={value}
        onChange={(e) => onText(e.target.value)}
        className={`min-h-[96px] w-full resize-y rounded-xl border border-navy/10 bg-cream-200/40 px-3 py-2.5 text-body leading-relaxed text-ink outline-none focus:border-gold/60 ${revising ? "opacity-50" : ""}`}
      />
      <div className="mt-2 flex items-center gap-2">
        <input
          value={consigne}
          onChange={(e) => onConsigne(e.target.value)}
          placeholder="Consigne de révision (ex. : raccourcis, plus prudent…)"
          className="flex-1 rounded-lg border border-navy/10 bg-white px-3 py-1.5 text-btn text-ink outline-none placeholder:text-muted/60 focus:border-gold/60"
        />
        <button
          onClick={onRevise} disabled={revising || !consigne.trim()}
          className="rounded-lg border border-gold/40 bg-gold/[0.08] px-3 py-1.5 text-btn font-medium text-gold-700 transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {revising ? "Révision…" : "Réviser"}
        </button>
      </div>
    </div>
  );
}

function ModeTable({ draft, mode }: { draft: MemoDraft; mode: string }) {
  const t = draft.tables.modes[mode];
  if (!t) return null;
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-navy/10 bg-cream-200/50">
      <table className="w-full border-collapse text-td">
        <thead>
          <tr className="border-b border-navy/10 text-left text-th font-semibold uppercase tracking-wide text-ink-soft">
            <th className="px-3 py-1.5">Freguesia</th><th className="px-3 py-1.5">Score</th><th className="px-3 py-1.5">Verdict</th>
            {t.headers.map((h) => <th key={h} className="px-3 py-1.5">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r) => (
            <tr key={r.name} className={`border-b border-navy/[0.05] ${r.is_scope ? "bg-gold/10" : ""}`}>
              <td className="px-3 py-1.5 text-ink">{r.name}{r.is_scope ? " ◆" : ""}</td>
              <td className="px-3 py-1.5 tabular-nums">{Math.round(r.score)}</td>
              <td className="px-3 py-1.5">{verdictLabel(r.verdict)}</td>
              {r.cols.map((c, i) => <td key={i} className="px-3 py-1.5 tabular-nums text-ink/80">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-1.5 text-label italic text-muted">Chiffres du moteur : non éditables, réinjectés au rendu.</div>
    </div>
  );
}
