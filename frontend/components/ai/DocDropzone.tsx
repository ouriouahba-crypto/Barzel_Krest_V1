"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n/useT";

// Zone de depot PDF/PPTX (glisser-deposer ou clic) : envoie les fichiers a
// /api/second-opinion/extract et remonte le texte extrait au parent. Verifie
// le format cote client, previent si aucun texte n'est extractible (PDF scanne).

export function DocDropzone({
  onExtracted,
  disabled,
}: {
  onExtracted: (docText: string, docNames: string[]) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const handle = async (files: FileList | null) => {
    if (!files || files.length === 0 || busy || disabled) return;
    const arr = Array.from(files).slice(0, 3);
    if (arr.some((f) => !/\.(pdf|pptx)$/i.test(f.name))) {
      setErr(t("ca.badFormat"));
      return;
    }
    setErr("");
    setBusy(true);
    try {
      const r = await api.secondOpinionExtract(arr);
      if (!r.doc_text || !r.doc_text.trim() || r.chars < 20) {
        setErr(t("ca.noText"));
      } else {
        onExtracted(r.doc_text, r.doc_names);
      }
    } catch {
      setErr(t("ca.extractError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled && !busy) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handle(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          over ? "border-gold bg-gold/[0.06]" : "border-gold/50 bg-white hover:border-gold hover:bg-gold/[0.03]"
        } ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        <IconUpload />
        <p className="mt-3 text-body font-medium text-navy">{busy ? t("ca.extracting") : t("ca.dropHint")}</p>
        <p className="mt-1 text-caption text-muted">{t("ca.dropSub")}</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.pptx"
          multiple
          hidden
          onChange={(e) => handle(e.target.files)}
        />
      </div>
      {err && <p className="mt-2 text-center text-caption text-red-600">{err}</p>}
    </div>
  );
}

function IconUpload() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" className="text-gold">
      <path
        d="M12 16V4m0 0L7 9m5-5 5 5M5 19h14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
