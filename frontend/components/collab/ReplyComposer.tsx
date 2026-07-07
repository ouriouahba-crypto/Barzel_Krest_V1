"use client";

// Champ de réponse en bas d'un fil (lot C2). L'envoi ajoute un message au fil au
// nom du compte courant (auteur), horodaté « à l'instant ». Sobre : un avatar du
// compte courant, une zone de saisie qui grandit, un bouton Répondre. Entrée =
// envoyer, Maj+Entrée = nouvelle ligne. Rien ne part si le texte est vide.

import { useState } from "react";
import { useCollabStore } from "@/lib/collab/store";
import { accountOf } from "@/lib/collab/types";
import { Avatar } from "./Avatar";

export function ReplyComposer({ threadId }: { threadId: string }) {
  const role = useCollabStore((s) => s.role);
  const addReply = useCollabStore((s) => s.addReply);
  const [text, setText] = useState("");
  const current = accountOf(role);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    addReply(threadId, role, body);
    setText("");
  };

  return (
    <div className="mt-4 flex items-start gap-3 border-t border-navy/10 pt-4">
      <Avatar id={role} size="md" />
      <div className="min-w-0 flex-1">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          aria-label={`Répondre en tant que ${current.name}`}
          placeholder={`Répondre en tant que ${current.name}...`}
          className="w-full resize-none rounded-xl border border-navy/15 bg-cream/40 px-3.5 py-2.5 text-body text-ink placeholder:text-muted focus:border-gold/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gold/25"
        />
        <div className="mt-2 flex items-center justify-end">
          <button
            type="button"
            onClick={send}
            disabled={!text.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-1.5 text-btn font-semibold text-cream transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Répondre
            <span aria-hidden className="text-gold">
              →
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
