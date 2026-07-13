// Données seedées de la couche collaborative (lot C1), par ville. Contenu métier
// crédible, aligné sur les verdicts et actifs de la plateforme, mais 100% figé :
// aucune valeur n'est recalculée, rien n'est marqué « simulé » à l'écran.
//
// i18n (lot QA-1a) : ce module reste de la DONNÉE PURE, il n'appelle jamais
// `translate()`. Les champs texte portent des CLÉS (cs.<ville>.<objet>.<champ>
// pour le contenu, col.time.* pour les horodatages relatifs) que les composants
// résolvent à l'affichage via `resolveText`. La STRUCTURE est inchangée (id,
// authorId, citySlug, anchor…), seules les valeurs textuelles sont devenues des
// clés. Les NOMS PROPRES restent en clair : libellés d'ancre (« Haya Towers ·
// Afurada »), mailles d'impact (« Santa Marinha »), sources de presse.
//
// Villes couvertes : gaia, lisbonne, porto, bruxelles (slugs du registre).

import type { Thread, FeedItem, ActivityItem, Anchor } from "./types";

// --- Fils de discussion (2 à 3 par ville) --------------------------------

const THREADS: Thread[] = [
  // ---------------- Gaia ----------------
  {
    id: "gaia-t1",
    citySlug: "gaia",
    title: "cs.gaia.t1.title",
    anchor: { kind: "asset", label: "Haya Towers · Afurada" },
    messages: [
      { id: "gaia-t1-m1", authorId: "B", time: "col.time.daysAgo", timeParams: { n: 2 }, text: "cs.gaia.t1.m1.text" },
      { id: "gaia-t1-m2", authorId: "A", time: "col.time.yesterday", text: "cs.gaia.t1.m2.text" },
      { id: "gaia-t1-m3", authorId: "B", time: "col.time.hoursAgo", timeParams: { n: 5 }, text: "cs.gaia.t1.m3.text" },
    ],
  },
  {
    id: "gaia-t2",
    citySlug: "gaia",
    title: "cs.gaia.t2.title",
    anchor: { kind: "verdict", label: "Promotion · Go" },
    messages: [
      { id: "gaia-t2-m1", authorId: "A", time: "col.time.daysAgo", timeParams: { n: 3 }, text: "cs.gaia.t2.m1.text" },
      { id: "gaia-t2-m2", authorId: "B", time: "col.time.daysAgo", timeParams: { n: 2 }, text: "cs.gaia.t2.m2.text" },
    ],
  },
  {
    id: "gaia-t3",
    citySlug: "gaia",
    title: "cs.gaia.t3.title",
    anchor: { kind: "zone", label: "São Félix da Marinha" },
    messages: [
      { id: "gaia-t3-m1", authorId: "A", time: "col.time.daysAgo", timeParams: { n: 2 }, text: "cs.gaia.t3.m1.text" },
      { id: "gaia-t3-m2", authorId: "B", time: "col.time.yesterday", text: "cs.gaia.t3.m2.text" },
    ],
  },

  // ---------------- Lisbonne ----------------
  {
    id: "lisbonne-t1",
    citySlug: "lisbonne",
    title: "cs.lisbonne.t1.title",
    anchor: { kind: "asset", label: "Formoso · Marvila" },
    messages: [
      { id: "lisbonne-t1-m1", authorId: "B", time: "col.time.daysAgo", timeParams: { n: 2 }, text: "cs.lisbonne.t1.m1.text" },
      { id: "lisbonne-t1-m2", authorId: "A", time: "col.time.yesterday", text: "cs.lisbonne.t1.m2.text" },
      { id: "lisbonne-t1-m3", authorId: "B", time: "col.time.hoursAgo", timeParams: { n: 4 }, text: "cs.lisbonne.t1.m3.text" },
    ],
  },
  {
    id: "lisbonne-t2",
    citySlug: "lisbonne",
    title: "cs.lisbonne.t2.title",
    anchor: { kind: "verdict", label: "Détention · Céder" },
    messages: [
      { id: "lisbonne-t2-m1", authorId: "A", time: "col.time.daysAgo", timeParams: { n: 3 }, text: "cs.lisbonne.t2.m1.text" },
      { id: "lisbonne-t2-m2", authorId: "B", time: "col.time.daysAgo", timeParams: { n: 2 }, text: "cs.lisbonne.t2.m2.text" },
    ],
  },
  {
    id: "lisbonne-t3",
    citySlug: "lisbonne",
    title: "cs.lisbonne.t3.title",
    anchor: { kind: "zone", label: "Marvila" },
    messages: [
      { id: "lisbonne-t3-m1", authorId: "B", time: "col.time.daysAgo", timeParams: { n: 2 }, text: "cs.lisbonne.t3.m1.text" },
      { id: "lisbonne-t3-m2", authorId: "A", time: "col.time.yesterday", text: "cs.lisbonne.t3.m2.text" },
    ],
  },

  // ---------------- Porto ----------------
  {
    id: "porto-t1",
    citySlug: "porto",
    title: "cs.porto.t1.title",
    anchor: { kind: "asset", label: "Campanhã Souto de Moura" },
    messages: [
      { id: "porto-t1-m1", authorId: "B", time: "col.time.daysAgo", timeParams: { n: 2 }, text: "cs.porto.t1.m1.text" },
      { id: "porto-t1-m2", authorId: "A", time: "col.time.yesterday", text: "cs.porto.t1.m2.text" },
      { id: "porto-t1-m3", authorId: "B", time: "col.time.hoursAgo", timeParams: { n: 3 }, text: "cs.porto.t1.m3.text" },
    ],
  },
  {
    id: "porto-t2",
    citySlug: "porto",
    title: "cs.porto.t2.title",
    anchor: { kind: "verdict", label: "Promotion · Go" },
    messages: [
      { id: "porto-t2-m1", authorId: "A", time: "col.time.daysAgo", timeParams: { n: 3 }, text: "cs.porto.t2.m1.text" },
      { id: "porto-t2-m2", authorId: "B", time: "col.time.daysAgo", timeParams: { n: 2 }, text: "cs.porto.t2.m2.text" },
    ],
  },
  {
    id: "porto-t3",
    citySlug: "porto",
    title: "cs.porto.t3.title",
    anchor: { kind: "zone", label: "Foz do Douro" },
    messages: [
      { id: "porto-t3-m1", authorId: "A", time: "col.time.daysAgo", timeParams: { n: 2 }, text: "cs.porto.t3.m1.text" },
      { id: "porto-t3-m2", authorId: "B", time: "col.time.yesterday", text: "cs.porto.t3.m2.text" },
    ],
  },

  // ---------------- Bruxelles ----------------
  {
    id: "bruxelles-t1",
    citySlug: "bruxelles",
    title: "cs.bruxelles.t1.title",
    anchor: { kind: "asset", label: "Dansaert Quai · Molenbeek" },
    messages: [
      { id: "bruxelles-t1-m1", authorId: "B", time: "col.time.daysAgo", timeParams: { n: 2 }, text: "cs.bruxelles.t1.m1.text" },
      { id: "bruxelles-t1-m2", authorId: "A", time: "col.time.yesterday", text: "cs.bruxelles.t1.m2.text" },
      { id: "bruxelles-t1-m3", authorId: "B", time: "col.time.hoursAgo", timeParams: { n: 6 }, text: "cs.bruxelles.t1.m3.text" },
    ],
  },
  {
    id: "bruxelles-t2",
    citySlug: "bruxelles",
    title: "cs.bruxelles.t2.title",
    anchor: { kind: "verdict", label: "Détention · Céder" },
    messages: [
      { id: "bruxelles-t2-m1", authorId: "A", time: "col.time.daysAgo", timeParams: { n: 3 }, text: "cs.bruxelles.t2.m1.text" },
      { id: "bruxelles-t2-m2", authorId: "B", time: "col.time.daysAgo", timeParams: { n: 2 }, text: "cs.bruxelles.t2.m2.text" },
    ],
  },
  {
    id: "bruxelles-t3",
    citySlug: "bruxelles",
    title: "cs.bruxelles.t3.title",
    anchor: { kind: "zone", label: "Molenbeek" },
    messages: [
      { id: "bruxelles-t3-m1", authorId: "B", time: "col.time.daysAgo", timeParams: { n: 2 }, text: "cs.bruxelles.t3.m1.text" },
      { id: "bruxelles-t3-m2", authorId: "A", time: "col.time.yesterday", text: "cs.bruxelles.t3.m2.text" },
    ],
  },
];

// --- Fil d'info (4 à 6 items par ville, 1 à 2 avec tag d'impact) ----------

const FEED: FeedItem[] = [
  // Gaia
  {
    id: "gaia-f1",
    citySlug: "gaia",
    source: "Diário Imobiliário",
    date: "cs.gaia.f1.date",
    category: "offre",
    title: "cs.gaia.f1.title",
    summary: "cs.gaia.f1.summary",
    impact: { zone: "Santa Marinha", note: "cs.gaia.f1.impact", zoneId: "santamarinhaesaopedrodaafurada", route: "/gaia" },
  },
  {
    id: "gaia-f2",
    citySlug: "gaia",
    source: "INE Estatísticas",
    date: "cs.gaia.f2.date",
    category: "prix",
    title: "cs.gaia.f2.title",
    summary: "cs.gaia.f2.summary",
  },
  {
    id: "gaia-f3",
    citySlug: "gaia",
    source: "Público Economia",
    date: "cs.gaia.f3.date",
    category: "reglementation",
    title: "cs.gaia.f3.title",
    summary: "cs.gaia.f3.summary",
  },
  {
    id: "gaia-f4",
    citySlug: "gaia",
    source: "ADENE",
    date: "cs.gaia.f4.date",
    category: "reglementation",
    title: "cs.gaia.f4.title",
    summary: "cs.gaia.f4.summary",
    impact: { zone: "Santa Marinha", note: "cs.gaia.f4.impact", zoneId: "santamarinhaesaopedrodaafurada", route: "/gaia" },
  },
  {
    id: "gaia-f5",
    citySlug: "gaia",
    source: "Expresso Imobiliário",
    date: "cs.gaia.f5.date",
    category: "offre",
    title: "cs.gaia.f5.title",
    summary: "cs.gaia.f5.summary",
  },

  // Lisbonne
  {
    id: "lisbonne-f1",
    citySlug: "lisbonne",
    source: "Idealista News",
    date: "cs.lisbonne.f1.date",
    category: "offre",
    title: "cs.lisbonne.f1.title",
    summary: "cs.lisbonne.f1.summary",
    impact: { zone: "Marvila", note: "cs.lisbonne.f1.impact", zoneId: "marvila", route: "/gaia" },
  },
  {
    id: "lisbonne-f2",
    citySlug: "lisbonne",
    source: "INE Habitação",
    date: "cs.lisbonne.f2.date",
    category: "prix",
    title: "cs.lisbonne.f2.title",
    summary: "cs.lisbonne.f2.summary",
  },
  {
    id: "lisbonne-f3",
    citySlug: "lisbonne",
    source: "Jornal de Negócios",
    date: "cs.lisbonne.f3.date",
    category: "reglementation",
    title: "cs.lisbonne.f3.title",
    summary: "cs.lisbonne.f3.summary",
    impact: { zone: "Santa Maria Maior", note: "cs.lisbonne.f3.impact", zoneId: "santamariamaior", route: "/gaia" },
  },
  {
    id: "lisbonne-f4",
    citySlug: "lisbonne",
    source: "Público Local",
    date: "cs.lisbonne.f4.date",
    category: "offre",
    title: "cs.lisbonne.f4.title",
    summary: "cs.lisbonne.f4.summary",
  },
  {
    id: "lisbonne-f5",
    citySlug: "lisbonne",
    source: "ADENE",
    date: "cs.lisbonne.f5.date",
    category: "reglementation",
    title: "cs.lisbonne.f5.title",
    summary: "cs.lisbonne.f5.summary",
  },

  // Porto
  {
    id: "porto-f1",
    citySlug: "porto",
    source: "Jornal de Notícias",
    date: "cs.porto.f1.date",
    category: "offre",
    title: "cs.porto.f1.title",
    summary: "cs.porto.f1.summary",
    impact: { zone: "Campanhã", note: "cs.porto.f1.impact", zoneId: "campanha", route: "/gaia" },
  },
  {
    id: "porto-f2",
    citySlug: "porto",
    source: "INE Habitação",
    date: "cs.porto.f2.date",
    category: "prix",
    title: "cs.porto.f2.title",
    summary: "cs.porto.f2.summary",
  },
  {
    id: "porto-f3",
    citySlug: "porto",
    source: "Público Porto",
    date: "cs.porto.f3.date",
    category: "offre",
    title: "cs.porto.f3.title",
    summary: "cs.porto.f3.summary",
  },
  {
    id: "porto-f4",
    citySlug: "porto",
    source: "Idealista News",
    date: "cs.porto.f4.date",
    category: "prix",
    title: "cs.porto.f4.title",
    summary: "cs.porto.f4.summary",
  },
  {
    id: "porto-f5",
    citySlug: "porto",
    source: "Diário Imobiliário",
    date: "cs.porto.f5.date",
    category: "macro",
    title: "cs.porto.f5.title",
    summary: "cs.porto.f5.summary",
    impact: { zone: "Bonfim", note: "cs.porto.f5.impact", zoneId: "bonfim", route: "/gaia" },
  },

  // Bruxelles
  {
    id: "bruxelles-f1",
    citySlug: "bruxelles",
    source: "L'Echo Immo",
    date: "cs.bruxelles.f1.date",
    category: "offre",
    title: "cs.bruxelles.f1.title",
    summary: "cs.bruxelles.f1.summary",
    impact: { zone: "Molenbeek", note: "cs.bruxelles.f1.impact", zoneId: "molenbeeksaintjean", route: "/gaia" },
  },
  {
    id: "bruxelles-f2",
    citySlug: "bruxelles",
    source: "Statbel",
    date: "cs.bruxelles.f2.date",
    category: "prix",
    title: "cs.bruxelles.f2.title",
    summary: "cs.bruxelles.f2.summary",
  },
  {
    id: "bruxelles-f3",
    citySlug: "bruxelles",
    source: "Le Soir Immo",
    date: "cs.bruxelles.f3.date",
    category: "reglementation",
    title: "cs.bruxelles.f3.title",
    summary: "cs.bruxelles.f3.summary",
    impact: { zone: "Ixelles", note: "cs.bruxelles.f3.impact", zoneId: "ixelles", route: "/gaia" },
  },
  {
    id: "bruxelles-f4",
    citySlug: "bruxelles",
    source: "Trends-Tendances",
    date: "cs.bruxelles.f4.date",
    category: "reglementation",
    title: "cs.bruxelles.f4.title",
    summary: "cs.bruxelles.f4.summary",
  },
  {
    id: "bruxelles-f5",
    citySlug: "bruxelles",
    source: "La Libre Éco",
    date: "cs.bruxelles.f5.date",
    category: "offre",
    title: "cs.bruxelles.f5.title",
    summary: "cs.bruxelles.f5.summary",
  },
];

// Objets d'impact navigables proposés au compositeur du fil d'info (lot C4) : des
// mailles réelles de la ville (libellé court + zoneId + route carte). Choisis pour
// couvrir les objets déjà cités dans les items seedés. Un item posté avec un de ces
// objets porte un tag d'impact cliquable (retour à la maille dans le dashboard).
// Les libellés sont des NOMS DE MAILLES : donnée, non traduits.
const FEED_ANCHOR_TARGETS: Record<string, Anchor[]> = {
  gaia: [
    { kind: "zone", label: "Santa Marinha e Afurada", zoneId: "santamarinhaesaopedrodaafurada", route: "/gaia" },
    { kind: "zone", label: "Madalena", zoneId: "madalena", route: "/gaia" },
    { kind: "zone", label: "Canidelo", zoneId: "canidelo", route: "/gaia" },
    { kind: "zone", label: "São Félix da Marinha", zoneId: "saofelixdamarinha", route: "/gaia" },
  ],
  lisbonne: [
    { kind: "zone", label: "Marvila", zoneId: "marvila", route: "/gaia" },
    { kind: "zone", label: "Beato", zoneId: "beato", route: "/gaia" },
    { kind: "zone", label: "Santa Maria Maior", zoneId: "santamariamaior", route: "/gaia" },
    { kind: "zone", label: "Parque das Nações", zoneId: "parquedasnacoes", route: "/gaia" },
  ],
  porto: [
    { kind: "zone", label: "Campanhã", zoneId: "campanha", route: "/gaia" },
    { kind: "zone", label: "Bonfim", zoneId: "bonfim", route: "/gaia" },
    { kind: "zone", label: "Foz do Douro", zoneId: "aldoarfoznevogilde", route: "/gaia" },
    { kind: "zone", label: "Paranhos", zoneId: "paranhos", route: "/gaia" },
  ],
  bruxelles: [
    { kind: "zone", label: "Molenbeek-Saint-Jean", zoneId: "molenbeeksaintjean", route: "/gaia" },
    { kind: "zone", label: "Forest", zoneId: "forest", route: "/gaia" },
    { kind: "zone", label: "Anderlecht", zoneId: "anderlecht", route: "/gaia" },
    { kind: "zone", label: "Ixelles", zoneId: "ixelles", route: "/gaia" },
  ],
};

// --- Fil d'activité (dérivé des discussions et du fil d'info) -------------

const ACTIVITY: ActivityItem[] = [
  // Gaia
  { id: "gaia-a1", citySlug: "gaia", authorId: "B", time: "col.time.hoursAgo", timeParams: { n: 5 }, text: "cs.gaia.a1.text" },
  { id: "gaia-a2", citySlug: "gaia", authorId: "A", time: "col.time.yesterday", text: "cs.gaia.a2.text" },
  { id: "gaia-a3", citySlug: "gaia", authorId: "A", time: "col.time.daysAgo", timeParams: { n: 2 }, text: "cs.gaia.a3.text" },
  { id: "gaia-a4", citySlug: "gaia", authorId: "B", time: "col.time.daysAgo", timeParams: { n: 2 }, text: "cs.gaia.a4.text" },

  // Lisbonne
  { id: "lisbonne-a1", citySlug: "lisbonne", authorId: "B", time: "col.time.hoursAgo", timeParams: { n: 4 }, text: "cs.lisbonne.a1.text" },
  { id: "lisbonne-a2", citySlug: "lisbonne", authorId: "A", time: "col.time.yesterday", text: "cs.lisbonne.a2.text" },
  { id: "lisbonne-a3", citySlug: "lisbonne", authorId: "A", time: "col.time.daysAgo", timeParams: { n: 3 }, text: "cs.lisbonne.a3.text" },
  { id: "lisbonne-a4", citySlug: "lisbonne", authorId: "B", time: "col.time.daysAgo", timeParams: { n: 2 }, text: "cs.lisbonne.a4.text" },

  // Porto
  { id: "porto-a1", citySlug: "porto", authorId: "B", time: "col.time.hoursAgo", timeParams: { n: 3 }, text: "cs.porto.a1.text" },
  { id: "porto-a2", citySlug: "porto", authorId: "A", time: "col.time.yesterday", text: "cs.porto.a2.text" },
  { id: "porto-a3", citySlug: "porto", authorId: "A", time: "col.time.daysAgo", timeParams: { n: 2 }, text: "cs.porto.a3.text" },
  { id: "porto-a4", citySlug: "porto", authorId: "B", time: "col.time.daysAgo", timeParams: { n: 2 }, text: "cs.porto.a4.text" },

  // Bruxelles
  { id: "bruxelles-a1", citySlug: "bruxelles", authorId: "B", time: "col.time.hoursAgo", timeParams: { n: 6 }, text: "cs.bruxelles.a1.text" },
  { id: "bruxelles-a2", citySlug: "bruxelles", authorId: "A", time: "col.time.yesterday", text: "cs.bruxelles.a2.text" },
  { id: "bruxelles-a3", citySlug: "bruxelles", authorId: "A", time: "col.time.daysAgo", timeParams: { n: 3 }, text: "cs.bruxelles.a3.text" },
  { id: "bruxelles-a4", citySlug: "bruxelles", authorId: "B", time: "col.time.daysAgo", timeParams: { n: 2 }, text: "cs.bruxelles.a4.text" },
];

// --- Sélecteurs par ville (le seed est figé, filtré par slug) -------------

export function seedThreads(citySlug: string): Thread[] {
  return THREADS.filter((t) => t.citySlug === citySlug);
}
export function seedFeed(citySlug: string): FeedItem[] {
  return FEED.filter((f) => f.citySlug === citySlug);
}
export function seedActivity(citySlug: string): ActivityItem[] {
  return ACTIVITY.filter((a) => a.citySlug === citySlug);
}

// Objets navigables proposés au compositeur du fil d'info (lot C4). Vide pour une
// ville non listée (le compositeur retombe alors sur « Aucun » impact).
export function feedAnchorTargets(citySlug: string): Anchor[] {
  return FEED_ANCHOR_TARGETS[citySlug] ?? [];
}

// Objets d'ancrage déjà présents dans le seed d'une ville (lot C2) : proposés au
// compositeur de nouveau fil, en plus de « Général ville » (défaut). Dédupliqués
// par libellé, dans l'ordre du seed.
export function seedAnchors(citySlug: string): Anchor[] {
  const byLabel = new Map<string, Anchor>();
  for (const t of THREADS) {
    if (t.citySlug !== citySlug) continue;
    if (!byLabel.has(t.anchor.label)) byLabel.set(t.anchor.label, t.anchor);
  }
  return [...byLabel.values()];
}
