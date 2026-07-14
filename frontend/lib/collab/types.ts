// Couche collaborative (lots C1 et C2) : modèle de données et comptes seedés.
// Le seed reste déterministe (aucun Date.now, aucun aléatoire) : ses horodatages
// sont des libellés relatifs figés, sans divergence SSR / hydratation. Le lot C2
// ajoute l'interactivité (répondre, démarrer un fil) : les éléments créés en
// session portent un libellé « à l'instant » et un numéro de séquence (seq) qui
// pilote la lecture des notifications ; ils vivent uniquement côté client, après
// hydratation depuis sessionStorage (jamais rendus au SSR).

// i18n (lot QA-1a) : les champs TEXTE de ce modèle ne portent plus du français,
// mais des CLÉS de dictionnaire (col.* pour le chrome, cs.* pour le contenu
// seedé), résolues À L'AFFICHAGE par les composants via `resolveText`. Les
// éléments créés en session portent, eux, du texte libre (la saisie), rendu
// verbatim par la même fonction. Les NOMS PROPRES (nom de compte, libellé
// d'ancre, source de presse) restent de la donnée, non traduits.

// `Mode` est une CLÉ moteur (type seul : aucun import à l'exécution, aucun cycle).
import type { Mode } from "@/lib/scoring";

export type AccountId = "A" | "B";
export type Role = "analyste" | "manager";

/** Paramètres d'interpolation d'une clé i18n (tokens {x}). */
export type TextParams = Record<string, string | number>;

export interface Account {
  id: AccountId;
  /** nom affiché (fictif, plausible) : nom propre, jamais traduit */
  name: string;
  role: Role;
  /** clé i18n du libellé de rôle (col.role.*) */
  roleLabel: string;
  /** initiales pour l'avatar */
  initials: string;
}

// Ancre d'un fil de discussion : l'objet de décision (maille, actif ou verdict),
// ou « général ville » pour un fil non rattaché à un objet précis (défaut du
// compositeur en C2 ; l'ancrage depuis un objet du dashboard est venu au C3).
export type AnchorKind = "zone" | "asset" | "verdict" | "general";

/**
 * Identité de navigation (lot C3, optionnelle). Quand une note est SIGNALÉE depuis
 * un objet du dashboard, l'ancre porte de quoi y revenir : `zoneId` = la maille à
 * focaliser sur la carte, `route` = la page du dashboard à rouvrir. Absents du seed
 * et des fils « général ville » (le chip retombe alors sur la vue d'ensemble).
 * Purement descriptif : aucune valeur, aucun score.
 */
interface AnchorNav {
  zoneId?: string;
  route?: string;
}

/**
 * Ancre de VERDICT (lot QA-1d) : elle ne porte plus un libellé (« Promotion · Go »,
 * qui était du français en dur, affiché tel quel en EN/PT et surtout comparé à un
 * libellé TRADUIT côté dashboard, donc jamais apparié hors FR), mais les CLÉS
 * CANONIQUES du moteur. Le libellé est COMPOSÉ à l'affichage (`anchorText`), et
 * l'appariement se fait sur les clés (`anchorKey`) : indépendant de la langue.
 */
export interface VerdictAnchor extends AnchorNav {
  kind: "verdict";
  /** clé moteur : "promotion" | "detention" | "arbitrage" | "landbank" */
  mode: Mode;
  /** clé moteur, ASCII : "Go", "Conditionnel", "Ceder", "Fenetre ouverte"… */
  verdict: string;
}

/**
 * Ancre NOMMÉE (maille, actif, « général ville »). Son `label` reste de la DONNÉE :
 * un nom propre (« Haya Towers · Afurada », « Marvila »), à une exception près,
 * l'ancre par défaut du compositeur, qui porte la clé `col.anchor.general`. Les
 * composants la passent par `resolveText` : une clé est traduite, un nom propre sort
 * verbatim. Rien à traduire ici, donc rien à structurer.
 */
export interface LabelAnchor extends AnchorNav {
  kind: "zone" | "asset" | "general";
  label: string;
}

export type Anchor = VerdictAnchor | LabelAnchor;

/**
 * IDENTITÉ CANONIQUE d'une ancre : la clé sur laquelle on APPARIE (`addSignal`
 * rattache une note à un fil ancré au même objet, `seedAnchors` déduplique). Jamais
 * un libellé affiché : un verdict s'identifie par (mode, verdict) moteur, donc un
 * signalement émis depuis un dashboard EN ou PT rejoint le fil ouvert en FR.
 * Le verdict est dé-accentué (« Céder » -> « Ceder ») pour que la forme d'affichage
 * FR et la forme moteur ASCII désignent bien le même objet.
 */
export function anchorKey(a: Anchor): string {
  if (a.kind === "verdict") {
    const canon = a.verdict.normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
    return `verdict|${a.mode}|${canon}`;
  }
  return `${a.kind}|${a.label}`;
}

export interface Message {
  id: string;
  authorId: AccountId;
  /** clé i18n de l'horodatage relatif (col.time.*), ex. col.time.daysAgo */
  time: string;
  /** tokens de l'horodatage (ex. { n: 2 } pour « il y a 2 j ») */
  timeParams?: TextParams;
  /** clé i18n (cs.*) pour un message seedé ; TEXTE LIBRE pour une réponse saisie */
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
  /**
   * Clé i18n (cs.*) pour un fil seedé ; TEXTE LIBRE pour un fil ouvert au
   * compositeur. ABSENT pour un fil ouvert par un SIGNALEMENT : son titre EST son
   * objet, rendu depuis l'ancre (`anchorText`) donc dans la langue du lecteur, et
   * non figé dans celle du signaleur.
   */
  title?: string;
  anchor: Anchor;
  messages: Message[];
}

// Catégories du fil d'info (lot C4). Taxonomie fixe, servie aux filtres du panneau.
// Les puces réellement affichées se limitent aux catégories présentes dans les items
// de la ville (seed + posts de session) : pas de filtre mort.
export type FeedCategory = "reglementation" | "financement" | "offre" | "prix" | "macro";

// `label` porte la CLÉ i18n de la catégorie (col.cat.*), résolue à l'affichage.
export const FEED_CATEGORIES: { id: FeedCategory; label: string }[] = [
  { id: "reglementation", label: "col.cat.reglementation" },
  { id: "financement", label: "col.cat.financement" },
  { id: "offre", label: "col.cat.offre" },
  { id: "prix", label: "col.cat.prix" },
  { id: "macro", label: "col.cat.macro" },
];

/** Clé i18n de la catégorie (à résoudre par le composant), repli sur l'id. */
export function feedCategoryLabel(id: FeedCategory): string {
  return FEED_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export interface FeedItem {
  id: string;
  citySlug: string;
  /** source crédible (fictive) : nom propre de publication, jamais traduit */
  source: string;
  /** clé i18n : date du seed (cs.*.date) ou `col.time.now` pour un post de session */
  date: string;
  /** clé i18n (cs.*) pour le seed ; TEXTE LIBRE pour une info publiée en session */
  title: string;
  /** clé i18n (cs.*) pour le seed ; TEXTE LIBRE pour une info publiée en session */
  summary: string;
  /** catégorie du fil (pilote les filtres du panneau) */
  category: FeedCategory;
  /**
   * Tag d'impact optionnel : maille concernée + note. Depuis le lot C4, `zoneId` /
   * `route` rendent le tag CLIQUABLE (retour à l'objet dans le dashboard, via
   * AnchorChip / focusBridge du C3). Sans ancrage navigable, pas de tag cliquable.
   * `zone` est un nom propre (donnée) ; `note` est une clé i18n (cs.*.impact),
   * absente des items postés en session.
   */
  impact?: { zone: string; note?: string; zoneId?: string; route?: string };
  /** compte auteur pour un item POSTÉ en session (manager) ; absent du seed */
  authorId?: AccountId;
}

export interface ActivityItem {
  id: string;
  citySlug: string;
  authorId: AccountId;
  /** clé i18n de l'horodatage relatif (col.time.*) */
  time: string;
  timeParams?: TextParams;
  /** clé i18n : contenu seedé (cs.*) ou entrée générée en session (col.activity.*) */
  text: string;
  /** tokens du texte (ex. { title } pour « a publié une info : « … » ») */
  textParams?: TextParams;
}

// Dernière consultation de la discussion, PAR VILLE et PAR COMPTE (lot C2).
// La valeur est le compteur de séquence au moment de la consultation : tout
// message créé (par l'autre compte) dont le seq est >= cette valeur est « non lu ».
export type SeenMap = Record<string, Partial<Record<AccountId, number>>>;

// --- Comptes seedés (deux rôles de démo) ---------------------------------
// A = analyste, B = directrice d'investissement. La bascule « Vu en tant que »
// change le compte courant partout ; défaut = A.

export const ACCOUNTS: Record<AccountId, Account> = {
  A: { id: "A", name: "Marc Oliveira", role: "analyste", roleLabel: "col.role.analyste", initials: "MO" },
  B: { id: "B", name: "Claire Vasseur", role: "manager", roleLabel: "col.role.manager", initials: "CV" },
};

export const ACCOUNT_LIST: Account[] = [ACCOUNTS.A, ACCOUNTS.B];
export const DEFAULT_ACCOUNT: AccountId = "A";

export function accountOf(id: AccountId): Account {
  return ACCOUNTS[id] ?? ACCOUNTS[DEFAULT_ACCOUNT];
}
