"use client";

import { useEffect, useState } from "react";
import { api, MemoDraft } from "@/lib/api";
import { getMemoDefaults } from "@/lib/session";
import { displayName } from "@/lib/useGaia";
import { MODES, Mode } from "@/lib/scoring";
import { cityBySlug } from "@/lib/cities";
import { useCityStore } from "@/lib/cityStore";
import { useLang, useT } from "@/lib/i18n/useT";
import { cityDisplay } from "@/lib/i18n/display";
import { assetClassesFor, classLabelFor, modeLabel, verdictDisplay } from "@/lib/i18n/domain";

// Les 3 angles : la CLÉ est canonique (elle part au backend), le libellé se traduit.
const ANGLE_KEYS = ["synthese", "acquisition", "detention"] as const;

// Investment-memo generator: form → LLM draft review (editable narrative,
// read-only figures) → deterministic PDF render.
export function MemoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const city = cityBySlug(useCityStore((s) => s.slug));
  const lang = useLang();
  const t = useT();
  // La MAILLE vient du registre des villes (freguesia / commune) : elle ne se
  // traduit pas, elle dépend du pays. Le backend en fait autant de son côté.
  const mesh = city.zoneNoun;
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
        // Repli : la ville COURANTE, pas « gaia » en dur (sinon la liste de mailles
        // d'une autre ville se remplissait des freguesias de Gaia).
        .city(city.slug, "promotion", d.assetClass)
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
      id === "executive_summary" || id === "risques" || id === "recommandation"
        ? t(`memo.step.${id}`)
        : t("memo.step.mode", { mode: modeLabel(id as Mode, lang) });
    setSteps([
      { id: "tables", label: t("memo.stepTables", { n: modes.length }), done: false },
      ...sectionIds.map((id) => ({ id, label: labelOf(id), done: false })),
    ]);
    const markDone = (id: string) => setSteps((s) => s.map((x) => (x.id === id ? { ...x, done: true } : x)));
    try {
      const body = { scope, asset_class: assetClass, modes, angle, instructions: instructions || undefined };
      const tb = await api.memoTables(body, lang);
      markDone("tables");
      const texts: Record<string, string> = {};
      await Promise.all(
        sectionIds.map((id) =>
          api.memoDraftSection({ ...body, section: id }, lang).then((r) => {
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
        tables: tb.tables,
        meta: tb.meta,
      });
      setStep("review");
    } catch {
      setError(t("memo.err.draft"));
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
        section_id: mode ? `lecture ${modeLabel(mode as Mode, lang)}` : id,
        texte_actuel: current,
        consigne,
        scope: draft.meta.scope,
        asset_class: draft.meta.asset_class,
      }, lang);
      setSection(id, mode, r.texte);
      setConsignes((c) => ({ ...c, [mode ?? id]: "" }));
    } catch {
      setError(t("memo.err.revise"));
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
      }, lang);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t("memo.err.render"));
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
            <div className="font-display text-[19px]">{t("memo.title")}</div>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-cream/60 transition-colors hover:bg-white/10 hover:text-cream">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {step === "form" && (
            <div className="flex flex-col gap-5">
              <Field label={t("memo.scope")}>
                <div className="flex flex-wrap items-center gap-2">
                  <Choice on={scope === "ville"} onClick={() => setScope("ville")} label={t("memo.scopeCity", { city: cityDisplay(city.slug, lang) })} />
                  <select
                    value={scope === "ville" ? "" : scope}
                    onChange={(e) => setScope(e.target.value || "ville")}
                    className={`rounded-xl border px-3 py-2 text-btn outline-none transition-colors ${
                      scope !== "ville" ? "border-gold/60 bg-gold/10 font-medium text-navy" : "border-navy/15 bg-white text-ink hover:border-gold/40"
                    }`}
                  >
                    <option value="">{t("memo.scopeZone", { mesh })}</option>
                    {fregs.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </Field>
              <Field label={t("memo.assetClass")}>
                <div className="flex flex-wrap gap-2">
                  {assetClassesFor(lang).map((c) => (
                    <Choice key={c.value} on={assetClass === c.value} onClick={() => setAssetClass(c.value)} label={c.label} />
                  ))}
                </div>
              </Field>
              <Field label={t("memo.modes")}>
                <div className="flex flex-wrap gap-2">
                  {MODES.map((m) => (
                    <label key={m} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-btn transition-colors ${modes.includes(m) ? "border-gold/60 bg-gold/10 text-navy" : "border-navy/15 bg-white text-ink-soft"}`}>
                      <input type="checkbox" className="accent-[#B8965A]" checked={modes.includes(m)} onChange={() => toggleMode(m)} />
                      {modeLabel(m, lang)}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label={t("memo.angle")}>
                <div className="flex flex-wrap gap-2">
                  {ANGLE_KEYS.map((a) => (
                    <Choice key={a} on={angle === a} onClick={() => setAngle(a)} label={t(`memo.angle.${a}`)} />
                  ))}
                </div>
              </Field>
              <Field label={t("memo.instructions")}>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder={t("memo.instructionsPlaceholder")}
                  className="h-20 w-full rounded-xl border border-navy/15 bg-white px-3 py-2.5 text-body text-ink outline-none placeholder:text-muted/60 focus:border-gold/60"
                />
              </Field>

              {busy === "draft" && steps.length > 0 && (
                <div className="rounded-2xl border border-gold/30 bg-white p-4 shadow-card">
                  <div className="mb-2 text-label font-semibold uppercase tracking-widest text-gold-700">
                    {t("memo.drafting", { done: steps.filter((s) => s.done).length, total: steps.length })}
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
              <p className="text-caption text-ink-soft">{t("memo.reviewIntro")}</p>

              <Section
                id="executive_summary" label={t("memo.sec.executive_summary")}
                value={draft.sections.executive_summary} busy={busy}
                consigne={consignes["executive_summary"] ?? ""}
                onText={(v) => setSection("executive_summary", null, v)}
                onConsigne={(v) => setConsignes((c) => ({ ...c, executive_summary: v }))}
                onRevise={() => doRevise("executive_summary", null, draft.sections.executive_summary)}
              />

              {draft.meta.modes.map((m) => (
                <div key={m}>
                  <Section
                    id={m} label={t("memo.sec.mode", { mode: modeLabel(m as Mode, lang) })}
                    value={draft.sections.lecture_par_mode[m] ?? ""} busy={busy}
                    consigne={consignes[m] ?? ""}
                    onText={(v) => setSection("lecture_par_mode", m, v)}
                    onConsigne={(v) => setConsignes((c) => ({ ...c, [m]: v }))}
                    onRevise={() => doRevise("lecture_par_mode", m, draft.sections.lecture_par_mode[m] ?? "")}
                  />
                  <ModeTable draft={draft} mode={m} mesh={mesh} />
                </div>
              ))}

              <Section
                id="risques" label={t("memo.sec.risques")}
                value={draft.sections.risques} busy={busy}
                consigne={consignes["risques"] ?? ""}
                onText={(v) => setSection("risques", null, v)}
                onConsigne={(v) => setConsignes((c) => ({ ...c, risques: v }))}
                onRevise={() => doRevise("risques", null, draft.sections.risques)}
              />
              <Section
                id="recommandation" label={t("memo.sec.recommandation")}
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
                {t("memo.back")}
              </button>
            )}
            {step === "form" ? (
              <button
                onClick={doDraft} disabled={busy === "draft"}
                className="rounded-xl border border-gold/50 bg-gold/15 px-5 py-2.5 text-btn font-medium text-gold-700 transition-colors hover:bg-gold/25 disabled:cursor-wait disabled:opacity-60"
              >
                {busy === "draft" ? t("memo.draftBusy") : t("memo.draftBtn")}
              </button>
            ) : (
              <button
                onClick={doRender} disabled={busy === "render"}
                className="rounded-xl bg-navy px-5 py-2.5 text-btn font-medium text-gold transition-colors hover:bg-navy-800 disabled:cursor-wait disabled:opacity-60"
              >
                {busy === "render" ? t("memo.renderBusy") : t("memo.renderBtn")}
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
  const t = useT();
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
          placeholder={t("memo.revisePlaceholder")}
          className="flex-1 rounded-lg border border-navy/10 bg-white px-3 py-1.5 text-btn text-ink outline-none placeholder:text-muted/60 focus:border-gold/60"
        />
        <button
          onClick={onRevise} disabled={revising || !consigne.trim()}
          className="rounded-lg border border-gold/40 bg-gold/[0.08] px-3 py-1.5 text-btn font-medium text-gold-700 transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {revising ? t("memo.reviseBusy") : t("memo.reviseBtn")}
        </button>
      </div>
    </div>
  );
}

// `mesh` : la maille de la ville (freguesia / commune). Ce mot ne se traduit PAS,
// il dépend du pays : l'en-tête suit donc la ville, pas la langue.
function ModeTable({ draft, mode, mesh }: { draft: MemoDraft; mode: string; mesh: string }) {
  const tbl = draft.tables.modes[mode];
  const t = useT();
  const lang = useLang();
  if (!tbl) return null;
  const meshTh = mesh.charAt(0).toUpperCase() + mesh.slice(1);
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-navy/10 bg-cream-200/50">
      <table className="w-full border-collapse text-td">
        <thead>
          <tr className="border-b border-navy/10 text-left text-th font-semibold uppercase tracking-wide text-ink-soft">
            <th className="px-3 py-1.5">{meshTh}</th><th className="px-3 py-1.5">{t("memo.th.score")}</th><th className="px-3 py-1.5">{t("memo.th.verdict")}</th>
            {tbl.headers.map((h) => <th key={h} className="px-3 py-1.5">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {tbl.rows.map((r) => (
            <tr key={r.name} className={`border-b border-navy/[0.05] ${r.is_scope ? "bg-gold/10" : ""}`}>
              <td className="px-3 py-1.5 text-ink">{r.name}{r.is_scope ? " ◆" : ""}</td>
              <td className="px-3 py-1.5 tabular-nums">{Math.round(r.score)}</td>
              {/* /tables sert la CLÉ canonique brute du moteur : on traduit ici. */}
              <td className="px-3 py-1.5">{verdictDisplay(r.verdict, lang)}</td>
              {r.cols.map((c, i) => <td key={i} className="px-3 py-1.5 tabular-nums text-ink/80">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-1.5 text-label italic text-muted">{t("memo.tableNote")}</div>
    </div>
  );
}
