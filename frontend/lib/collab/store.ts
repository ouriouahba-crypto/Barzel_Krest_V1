// Store léger de la couche collaborative (lots C1 et C2). Responsabilités :
//  1) le compte courant (rôle A/B), persisté en sessionStorage, défaut = A ;
//  2) les ÉLÉMENTS CRÉÉS EN SESSION (réponses, fils, notes, posts du fil d'info),
//     persistés par-dessus le seed figé ;
//  3) le suivi des NON-LUS (lot C2) : un compteur de séquence monotone `seq` et
//     une carte `lastSeen` (ville × compte). Un message créé par l'autre compte
//     dont le seq est >= lastSeen[ville][compte] est « non lu » pour ce compte.
//
// SSR : l'état initial (rôle A, créés vides, seq 1, lastSeen vide) est identique
// côté serveur et au premier rendu client (aucune divergence d'hydratation).
// `hydrate()` lit le sessionStorage côté client uniquement, après montage, et ne
// touche jamais au rendu serveur. Comme chaque mutation persiste immédiatement,
// une ré-hydratation ultérieure (navigation) ne perd aucune donnée.

import { create } from "zustand";
import type { AccountId, ActivityItem, Anchor, FeedItem, Message, SeenMap, Thread } from "./types";
import { DEFAULT_ACCOUNT } from "./types";
import { seedActivity, seedFeed, seedThreads } from "./seed";

const ROLE_KEY = "barzel_collab_role";
const CREATED_KEY = "barzel_collab_created";
const SEEN_KEY = "barzel_collab_seen";

/** Éléments créés en session (par-dessus le seed figé). */
export interface Created {
  /** réponses ajoutées à un fil existant, par threadId */
  messages: Record<string, Message[]>;
  /** nouveaux fils créés en session */
  threads: Thread[];
  /** items de fil d'info postés en session (réservé C4) */
  feed: FeedItem[];
  /** entrées de fil d'activité générées en session (réservé C4) */
  activity: ActivityItem[];
}

const emptyCreated = (): Created => ({ messages: {}, threads: [], feed: [], activity: [] });

interface CollabState {
  /** compte courant ; change le « Vu en tant que » partout */
  role: AccountId;
  created: Created;
  /** prochain numéro de séquence à attribuer (monotone, persisté) */
  seq: number;
  /** dernière consultation de la discussion, par ville et par compte */
  lastSeen: SeenMap;
  /** vrai une fois le sessionStorage relu (évite de re-clobber au re-montage) */
  hydrated: boolean;
  setRole: (id: AccountId) => void;
  /** hydrate rôle + créés + non-lus depuis sessionStorage (client, après montage) */
  hydrate: () => void;
  // --- Interactivité C2 ---------------------------------------------------
  /** répond à un fil (seedé ou créé) au nom du compte courant fourni */
  addReply: (threadId: string, authorId: AccountId, text: string) => void;
  /** démarre un nouveau fil de discussion au nom du compte fourni */
  addThread: (input: { citySlug: string; title: string; anchor: Anchor; authorId: AccountId; text: string }) => void;
  /**
   * Signale un objet du dashboard (lot C3) : remonte une note dans la discussion de
   * la ville, ancrée à l'objet. Si un fil ancré au MÊME objet existe déjà (seed ou
   * créé), la note s'y ajoute ; sinon un fil ancré est ouvert (titre = nom de
   * l'objet). Même mécanique de séquence/non-lus que `addReply`/`addThread`.
   */
  addSignal: (input: { citySlug: string; anchor: Anchor; authorId: AccountId; text: string }) => void;
  /** marque la discussion de la ville comme lue pour le compte (vide la pastille) */
  markSeen: (citySlug: string, account: AccountId) => void;
  // --- Réservé C4 ---------------------------------------------------------
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
function persistSeen(seq: number, lastSeen: SeenMap) {
  try {
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify({ seq, lastSeen }));
  } catch {
    /* stockage indisponible */
  }
}

export const useCollabStore = create<CollabState>((set, get) => ({
  role: DEFAULT_ACCOUNT,
  created: emptyCreated(),
  seq: 1,
  lastSeen: {},
  hydrated: false,
  setRole: (id) => {
    persistRole(id);
    set({ role: id });
  },
  hydrate: () => {
    if (typeof window === "undefined" || get().hydrated) return;
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
    let seq = get().seq;
    let lastSeen = get().lastSeen;
    try {
      const raw = window.sessionStorage.getItem(SEEN_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { seq?: number; lastSeen?: SeenMap };
        if (typeof parsed.seq === "number" && parsed.seq >= 1) seq = parsed.seq;
        if (parsed.lastSeen && typeof parsed.lastSeen === "object") lastSeen = parsed.lastSeen;
      }
    } catch {
      /* données illisibles */
    }
    // Filet : le compteur doit rester au-dessus de tout seq déjà créé.
    seq = Math.max(seq, maxCreatedSeq(created) + 1);
    set({ role, created, seq, lastSeen, hydrated: true });
  },
  addReply: (threadId, authorId, text) => {
    const body = text.trim();
    if (!body) return;
    const s = get().seq;
    const message: Message = { id: `sess-m${s}`, authorId, time: "à l'instant", text: body, seq: s };
    const created = get().created;
    const next: Created = {
      ...created,
      messages: { ...created.messages, [threadId]: [...(created.messages[threadId] ?? []), message] },
    };
    const seq = s + 1;
    persistCreated(next);
    persistSeen(seq, get().lastSeen);
    set({ created: next, seq });
  },
  addThread: ({ citySlug, title, anchor, authorId, text }) => {
    const cleanTitle = title.trim();
    const body = text.trim();
    if (!cleanTitle || !body) return;
    const s = get().seq;
    const message: Message = { id: `sess-m${s}`, authorId, time: "à l'instant", text: body, seq: s };
    const thread: Thread = { id: `sess-t${s}`, citySlug, title: cleanTitle, anchor, messages: [message] };
    const next = { ...get().created, threads: [...get().created.threads, thread] };
    const seq = s + 1;
    persistCreated(next);
    persistSeen(seq, get().lastSeen);
    set({ created: next, seq });
  },
  addSignal: ({ citySlug, anchor, authorId, text }) => {
    const body = text.trim();
    if (!body) return;
    const s = get().seq;
    const created = get().created;
    const message: Message = { id: `sess-m${s}`, authorId, time: "à l'instant", text: body, seq: s };
    // Fil ancré au même objet (seed OU créé) : on y ajoute la note ; sinon on ouvre
    // un fil ancré. Correspondance par (type d'ancre, libellé) : les objets signalés
    // depuis le dashboard portent le libellé exact des ancres du seed (nom de maille,
    // « Mode · Verdict »), donc une note sur un objet déjà discuté le rejoint.
    const existing = threadsForCity(citySlug, created).find(
      (t) => t.anchor.kind === anchor.kind && t.anchor.label === anchor.label,
    );
    let next: Created;
    if (existing) {
      next = {
        ...created,
        messages: {
          ...created.messages,
          [existing.id]: [...(created.messages[existing.id] ?? []), message],
        },
      };
    } else {
      const thread: Thread = { id: `sess-t${s}`, citySlug, title: anchor.label, anchor, messages: [message] };
      next = { ...created, threads: [...created.threads, thread] };
    }
    const seq = s + 1;
    persistCreated(next);
    persistSeen(seq, get().lastSeen);
    set({ created: next, seq });
  },
  markSeen: (citySlug, account) => {
    const s = get().seq;
    const cur = get().lastSeen[citySlug] ?? {};
    if (cur[account] === s) return; // déjà à jour : aucun re-render
    const lastSeen: SeenMap = { ...get().lastSeen, [citySlug]: { ...cur, [account]: s } };
    persistSeen(s, lastSeen);
    set({ lastSeen });
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
// Fonctions pures (prennent `created` en argument) : aucune dépendance à React.
// En l'absence de créés, le rendu est exactement le seed.

export function threadsForCity(citySlug: string, created: Created): Thread[] {
  // Les réponses/notes ajoutées à un fil vivent dans `created.messages[threadId]`,
  // qu'il soit SEEDÉ ou CRÉÉ en session : on les fusionne dans les deux cas (sinon
  // une note remontée vers un fil de session, ou une réponse à un fil de session,
  // resterait invisible et hors du compte des non-lus).
  const withExtra = (t: Thread) => {
    const extra = created.messages[t.id];
    return extra && extra.length ? { ...t, messages: [...t.messages, ...extra] } : t;
  };
  const seeded = seedThreads(citySlug).map(withExtra);
  const sessionThreads = created.threads.filter((t) => t.citySlug === citySlug).map(withExtra);
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

// --- Non-lus (lot C2) -----------------------------------------------------
// Seuls les messages CRÉÉS (porteurs d'un seq) comptent ; le seed est la baseline
// « déjà lue ». Un message est non lu pour `account` s'il vient de l'AUTRE compte
// et que son seq est >= la dernière consultation de ce compte dans cette ville.

function maxCreatedSeq(created: Created): number {
  let max = 0;
  for (const list of Object.values(created.messages)) {
    for (const m of list) if (m.seq && m.seq > max) max = m.seq;
  }
  for (const t of created.threads) {
    for (const m of t.messages) if (m.seq && m.seq > max) max = m.seq;
  }
  return max;
}

/** Nombre de messages non lus pour `account` dans la discussion de la ville. */
export function unreadCountForCity(
  citySlug: string,
  account: AccountId,
  created: Created,
  lastSeen: SeenMap,
): number {
  const seen = lastSeen[citySlug]?.[account] ?? 0;
  return threadsForCity(citySlug, created).reduce(
    (n, t) => n + t.messages.filter((m) => m.seq !== undefined && m.authorId !== account && m.seq >= seen).length,
    0,
  );
}

/** Nombre de messages non lus pour `account` dans un fil précis (déjà fusionné). */
export function threadUnreadCount(thread: Thread, account: AccountId, citySlug: string, lastSeen: SeenMap): number {
  const seen = lastSeen[citySlug]?.[account] ?? 0;
  return thread.messages.filter((m) => m.seq !== undefined && m.authorId !== account && m.seq >= seen).length;
}
