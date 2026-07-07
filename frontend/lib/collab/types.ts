// Couche collaborative (lot C1) : modèle de données et comptes seedés.
// Tout est déterministe (aucun Date.now, aucun aléatoire) : les horodatages sont
// des libellés relatifs figés dans le seed, sans divergence SSR / hydratation.
// Les lots C2 à C4 ajouteront l'interactivité (poster, répondre, signaler) en
// s'appuyant sur ces mêmes types et sur la tranche « éléments créés en session »
// du store.

export type AccountId = "A" | "B";
export type Role = "analyste" | "manager";

export interface Account {
  id: AccountId;
  /** nom affiché (fictif, plausible) */
  name: string;
  role: Role;
  /** libellé lisible du rôle */
  roleLabel: string;
  /** initiales pour l'avatar */
  initials: string;
}

/** Ancre d'un fil de discussion : l'objet de décision (maille, actif ou verdict). */
export type AnchorKind = "zone" | "asset" | "verdict";
export interface Anchor {
  kind: AnchorKind;
  label: string;
}

export interface Message {
  id: string;
  authorId: AccountId;
  /** horodatage relatif prêt à l'affichage (ex. « il y a 2 h ») */
  time: string;
  text: string;
}

export interface Thread {
  id: string;
  citySlug: string;
  /** titre de décision (ex. « Activer le foncier de Campanhã ? ») */
  title: string;
  anchor: Anchor;
  messages: Message[];
}

export interface FeedItem {
  id: string;
  citySlug: string;
  /** source crédible (fictive) */
  source: string;
  /** date d'affichage (ex. « 2 juil. 2026 ») */
  date: string;
  title: string;
  summary: string;
  /** tag d'impact optionnel : maille concernée + note de verdict */
  impact?: { zone: string; note: string };
}

export interface ActivityItem {
  id: string;
  citySlug: string;
  authorId: AccountId;
  time: string;
  text: string;
}

// --- Comptes seedés (deux rôles de démo) ---------------------------------
// A = analyste, B = directrice d'investissement. La bascule « Vu en tant que »
// change le compte courant partout ; défaut = A.

export const ACCOUNTS: Record<AccountId, Account> = {
  A: { id: "A", name: "Marc Oliveira", role: "analyste", roleLabel: "Analyste", initials: "MO" },
  B: { id: "B", name: "Claire Vasseur", role: "manager", roleLabel: "Directrice d'investissement", initials: "CV" },
};

export const ACCOUNT_LIST: Account[] = [ACCOUNTS.A, ACCOUNTS.B];
export const DEFAULT_ACCOUNT: AccountId = "A";

export function accountOf(id: AccountId): Account {
  return ACCOUNTS[id] ?? ACCOUNTS[DEFAULT_ACCOUNT];
}
