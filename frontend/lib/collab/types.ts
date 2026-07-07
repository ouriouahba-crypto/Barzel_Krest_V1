// Couche collaborative (lots C1 et C2) : modèle de données et comptes seedés.
// Le seed reste déterministe (aucun Date.now, aucun aléatoire) : ses horodatages
// sont des libellés relatifs figés, sans divergence SSR / hydratation. Le lot C2
// ajoute l'interactivité (répondre, démarrer un fil) : les éléments créés en
// session portent un libellé « à l'instant » et un numéro de séquence (seq) qui
// pilote la lecture des notifications ; ils vivent uniquement côté client, après
// hydratation depuis sessionStorage (jamais rendus au SSR).

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

// Ancre d'un fil de discussion : l'objet de décision (maille, actif ou verdict),
// ou « général ville » pour un fil non rattaché à un objet précis (défaut du
// compositeur en C2 ; l'ancrage depuis un objet du dashboard viendra au C3).
export type AnchorKind = "zone" | "asset" | "verdict" | "general";
export interface Anchor {
  kind: AnchorKind;
  label: string;
  /**
   * Identité de navigation (lot C3, optionnelle). Quand une note est SIGNALÉE
   * depuis un objet du dashboard, l'ancre porte de quoi y revenir : `zoneId` = la
   * maille à focaliser sur la carte, `route` = la page du dashboard à rouvrir.
   * Absents du seed et des fils « général ville » (le chip retombe alors sur la
   * vue d'ensemble). Purement descriptif : aucune valeur, aucun score.
   */
  zoneId?: string;
  route?: string;
}

export interface Message {
  id: string;
  authorId: AccountId;
  /** horodatage relatif prêt à l'affichage (ex. « il y a 2 h », « à l'instant ») */
  time: string;
  text: string;
  /**
   * Numéro de séquence, présent uniquement sur les messages créés en session
   * (lot C2). Absent sur le seed (baseline toujours « lu »). Monotone, il ordonne
   * les créations et sert au calcul des non-lus face à `lastSeen`.
   */
  seq?: number;
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

// Dernière consultation de la discussion, PAR VILLE et PAR COMPTE (lot C2).
// La valeur est le compteur de séquence au moment de la consultation : tout
// message créé (par l'autre compte) dont le seq est >= cette valeur est « non lu ».
export type SeenMap = Record<string, Partial<Record<AccountId, number>>>;

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
