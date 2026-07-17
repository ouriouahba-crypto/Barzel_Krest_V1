// Store des conversations IA (zustand), persiste en localStorage (`barzel_chats`).
// Partage par les trois surfaces IA (analyste, chat lateral, contre-analyse) via
// le champ `kind`. Meme modele SSR-safe que langStore/sidebarStore : aucun acces
// localStorage au niveau module, defaut vide (identique au rendu serveur, zero
// divergence d'hydratation), hydrate() applique le persiste au montage. Chaque
// mutation reecrit la persistance. Mono-poste : la memoire vit dans le navigateur.

import { create } from "zustand";

const CHATS_KEY = "barzel_chats";

export type ChatKind = "analyst" | "sidebar" | "second-opinion";
export type ChatRole = "user" | "assistant" | "error";

export interface ChatMsg {
  role: ChatRole;
  text: string;
  at: string; // horodatage HH:MM (affichage)
}

export interface Conversation {
  id: string;
  kind: ChatKind;
  title: string;
  city: string; // slug ville au moment de la conversation
  cls: string; // classe d'actif
  lang: string;
  messages: ChatMsg[];
  createdAt: number;
  updatedAt: number;
  docText?: string; // Contre-analyse : texte extrait du/des document(s)
  docNames?: string[];
}

interface ChatState {
  conversations: Conversation[];
  hydrated: boolean;
  hydrate: () => void;
  create: (kind: ChatKind, city: string, cls: string, lang: string) => string;
  append: (id: string, msg: ChatMsg) => void;
  rename: (id: string, title: string) => void;
  remove: (id: string) => void;
  setDoc: (id: string, docText: string, docNames: string[]) => void;
}

function persist(list: Conversation[]) {
  try {
    window.localStorage.setItem(CHATS_KEY, JSON.stringify(list));
  } catch {
    /* stockage indisponible : la session garde l'etat en memoire */
  }
}

function newId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  hydrated: false,
  hydrate: () => {
    if (typeof window === "undefined" || get().hydrated) return;
    try {
      const raw = window.localStorage.getItem(CHATS_KEY);
      const parsed = raw ? (JSON.parse(raw) as Conversation[]) : [];
      set({ conversations: Array.isArray(parsed) ? parsed : [], hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  create: (kind, city, cls, lang) => {
    const id = newId();
    const ts = Date.now();
    const conv: Conversation = { id, kind, title: "", city, cls, lang, messages: [], createdAt: ts, updatedAt: ts };
    set((s) => {
      const list = [conv, ...s.conversations];
      persist(list);
      return { conversations: list };
    });
    return id;
  },
  append: (id, msg) =>
    set((s) => {
      const list = s.conversations.map((c) =>
        c.id === id ? { ...c, messages: [...c.messages, msg], updatedAt: Date.now() } : c,
      );
      persist(list);
      return { conversations: list };
    }),
  rename: (id, title) =>
    set((s) => {
      const list = s.conversations.map((c) => (c.id === id ? { ...c, title } : c));
      persist(list);
      return { conversations: list };
    }),
  remove: (id) =>
    set((s) => {
      const list = s.conversations.filter((c) => c.id !== id);
      persist(list);
      return { conversations: list };
    }),
  setDoc: (id, docText, docNames) =>
    set((s) => {
      const list = s.conversations.map((c) =>
        c.id === id ? { ...c, docText, docNames, updatedAt: Date.now() } : c,
      );
      persist(list);
      return { conversations: list };
    }),
}));
