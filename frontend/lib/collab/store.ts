// Store léger de la couche collaborative (lot C1). Deux responsabilités :
//  1) le compte courant (rôle A/B), persisté en sessionStorage, défaut = A ;
//  2) la place des ÉLÉMENTS CRÉÉS EN SESSION (réponses, notes, posts du fil
//     d'info), eux aussi persistés : vide en C1, les lots C2 à C4 les rempliront
//     via addReply / addThread / addFeedItem / addActivity.
//
// SSR : l'état initial (rôle A, créés vides) est identique côté serveur et au
// premier rendu client (aucune divergence d'hydratation). `hydrate()` lit le
// sessionStorage côté client uniquement, après montage.

import { create } from "zustand";
import type { AccountId, ActivityItem, FeedItem, Message, Thread } from "./types";
import { DEFAULT_ACCOUNT } from "./types";
import { seedActivity, seedFeed, seedThreads } from "./seed";

const ROLE_KEY = "barzel_collab_role";
const CREATED_KEY = "barzel_collab_created";

/** Éléments créés en session (par-dessus le seed figé). Vide en C1. */
export interface Created {
  /** réponses ajoutées à un fil existant, par threadId */
  messages: Record<string, Message[]>;
  /** nouveaux fils créés en session */
  threads: Thread[];
  /** items de fil d'info postés en session */
  feed: FeedItem[];
  /** entrées de fil d'activité générées en session */
  activity: ActivityItem[];
}

const emptyCreated = (): Created => ({ messages: {}, threads: [], feed: [], activity: [] });

interface CollabState {
  /** compte courant ; change le « Vu en tant que » partout */
  role: AccountId;
  created: Created;
  setRole: (id: AccountId) => void;
  /** hydrate rôle + créés depuis sessionStorage (client, après montage) */
  hydrate: () => void;
  // Réservé aux lots C2 à C4 (interactivité). Aucun appel en C1.
  addReply: (threadId: string, message: Message) => void;
  addThread: (thread: Thread) => void;
  addFeedItem: (item: FeedItem) => void;
  addActivity: (item: ActivityItem) => void;
}

function persistRole(role: AccountId) {
  try {
    window.sessionStorage.setItem(ROLE_KEY, role);
  } catch {
    /* stockage indisponible : le choix vaut pour la session courante */
  }
}
function persistCreated(created: Created) {
  try {
    window.sessionStorage.setItem(CREATED_KEY, JSON.stringify(created));
  } catch {
    /* stockage indisponible */
  }
}

export const useCollabStore = create<CollabState>((set, get) => ({
  role: DEFAULT_ACCOUNT,
  created: emptyCreated(),
  setRole: (id) => {
    persistRole(id);
    set({ role: id });
  },
  hydrate: () => {
    if (typeof window === "undefined") return;
    let role = get().role;
    try {
      const stored = window.sessionStorage.getItem(ROLE_KEY);
      if (stored === "A" || stored === "B") role = stored;
    } catch {
      /* stockage indisponible */
    }
    let created = get().created;
    try {
      const raw = window.sessionStorage.getItem(CREATED_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Created>;
        created = { ...emptyCreated(), ...parsed };
      }
    } catch {
      /* données illisibles : on garde le seed seul */
    }
    set({ role, created });
  },
  addReply: (threadId, message) => {
    const created = get().created;
    const next: Created = {
      ...created,
      messages: { ...created.messages, [threadId]: [...(created.messages[threadId] ?? []), message] },
    };
    persistCreated(next);
    set({ created: next });
  },
  addThread: (thread) => {
    const next = { ...get().created, threads: [...get().created.threads, thread] };
    persistCreated(next);
    set({ created: next });
  },
  addFeedItem: (item) => {
    const next = { ...get().created, feed: [...get().created.feed, item] };
    persistCreated(next);
    set({ created: next });
  },
  addActivity: (item) => {
    const next = { ...get().created, activity: [...get().created.activity, item] };
    persistCreated(next);
    set({ created: next });
  },
}));

// --- Sélecteurs de lecture : seed figé fusionné avec les créés en session ---
// Fonctions pures (prennent `created` en argument) : aucune dépendance à React,
// réutilisables par les lots suivants. En C1, `created` est vide : le rendu est
// exactement le seed.

export function threadsForCity(citySlug: string, created: Created): Thread[] {
  const seeded = seedThreads(citySlug).map((t) => {
    const extra = created.messages[t.id];
    return extra && extra.length ? { ...t, messages: [...t.messages, ...extra] } : t;
  });
  const sessionThreads = created.threads.filter((t) => t.citySlug === citySlug);
  // Les fils créés en session ouvrent la discussion (les plus récents en tête).
  return [...sessionThreads, ...seeded];
}

export function feedForCity(citySlug: string, created: Created): FeedItem[] {
  const sessionFeed = created.feed.filter((f) => f.citySlug === citySlug);
  return [...sessionFeed, ...seedFeed(citySlug)];
}

export function activityForCity(citySlug: string, created: Created): ActivityItem[] {
  const sessionActivity = created.activity.filter((a) => a.citySlug === citySlug);
  return [...sessionActivity, ...seedActivity(citySlug)];
}
