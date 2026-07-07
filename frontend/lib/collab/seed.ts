// Données seedées de la couche collaborative (lot C1), par ville. Contenu métier
// crédible, aligné sur les verdicts et actifs de la plateforme, mais 100% figé :
// aucune valeur n'est recalculée, rien n'est marqué « simulé » à l'écran. Les
// lots suivants viendront y ajouter les éléments créés en session (via le store).
//
// Villes couvertes : gaia, lisbonne, porto, bruxelles (slugs du registre).

import type { Thread, FeedItem, ActivityItem, Anchor } from "./types";

// --- Fils de discussion (2 à 3 par ville) --------------------------------

const THREADS: Thread[] = [
  // ---------------- Gaia ----------------
  {
    id: "gaia-t1",
    citySlug: "gaia",
    title: "Verrouiller le prix de sortie de Haya Towers ?",
    anchor: { kind: "asset", label: "Haya Towers · Afurada" },
    messages: [
      {
        id: "gaia-t1-m1",
        authorId: "B",
        time: "il y a 2 j",
        text: "Haya ressort à 35,5% de marge à 5 750 €/m². Avant d'arbitrer, je veux comprendre si la prime de +111% tient face à l'offre neuve côté fleuve.",
      },
      {
        id: "gaia-t1-m2",
        authorId: "A",
        time: "hier",
        text: "La prime se lit sur une médiane ancienne basse, 2 721 €/m². Le comparable neuf récent à Afurada valide 5 500 à 5 900. Je garde 5 750 en central, 5 500 en prudent.",
      },
      {
        id: "gaia-t1-m3",
        authorId: "B",
        time: "il y a 5 h",
        text: "OK pour 5 750 en central. On tranche à la prochaine revue de comité.",
      },
    ],
  },
  {
    id: "gaia-t2",
    citySlug: "gaia",
    title: "Madalena confirme-t-elle le trio de tête ?",
    anchor: { kind: "verdict", label: "Promotion · Go" },
    messages: [
      {
        id: "gaia-t2-m1",
        authorId: "A",
        time: "il y a 3 j",
        text: "Trois freguesias Go en résidentiel : Santa Marinha 30%, Madalena 29%, Canidelo 24%. Madalena tient sur un foncier à 594 €/m².",
      },
      {
        id: "gaia-t2-m2",
        authorId: "B",
        time: "il y a 2 j",
        text: "Le foncier me paraît le vrai risque. Si Canidelo se renchérit, la hiérarchie bouge.",
      },
    ],
  },
  {
    id: "gaia-t3",
    citySlug: "gaia",
    title: "São Félix : marge correcte, marché trop étroit ?",
    anchor: { kind: "zone", label: "São Félix da Marinha" },
    messages: [
      {
        id: "gaia-t3-m1",
        authorId: "A",
        time: "il y a 2 j",
        text: "São Félix affiche 11% de marge mais un délai de vente long. La note d'analyse la classe Passer : le neuf n'y trouve pas preneur assez vite.",
      },
      {
        id: "gaia-t3-m2",
        authorId: "B",
        time: "hier",
        text: "D'accord pour Passer. On ne force pas un programme sur un marché sans profondeur.",
      },
    ],
  },

  // ---------------- Lisbonne ----------------
  {
    id: "lisbonne-t1",
    citySlug: "lisbonne",
    title: "Formoso : caler le prix de sortie à Marvila ?",
    anchor: { kind: "asset", label: "Formoso · Marvila" },
    messages: [
      {
        id: "lisbonne-t1-m1",
        authorId: "B",
        time: "il y a 2 j",
        text: "Formoso ressort à 66/100, marge 20,5% à 5 400 €/m². Le passage en Go se joue autour de 5 590. On vise quel central ?",
      },
      {
        id: "lisbonne-t1-m2",
        authorId: "A",
        time: "hier",
        text: "La médiane Marvila est à 5 029, donc 5 400 porte déjà une prime. Je resterais central, quitte à laisser la bascule Go pour l'exécution.",
      },
      {
        id: "lisbonne-t1-m3",
        authorId: "B",
        time: "il y a 4 h",
        text: "Bien. On documente la sensibilité pour le comité.",
      },
    ],
  },
  {
    id: "lisbonne-t2",
    citySlug: "lisbonne",
    title: "Centre historique : céder malgré le loyer facial ?",
    anchor: { kind: "verdict", label: "Détention · Céder" },
    messages: [
      {
        id: "lisbonne-t2-m1",
        authorId: "A",
        time: "il y a 3 j",
        text: "Les loyers faciaux les plus hauts, Santa Maria Maior à 20,2 €/m²/mois, sont des pièges : marché AL, vacance longue. Le net réel passe sous le plancher.",
      },
      {
        id: "lisbonne-t2-m2",
        authorId: "B",
        time: "il y a 2 j",
        text: "Donc on cède dans la fenêtre plutôt que détenir sous le plancher. Cohérent avec la doctrine.",
      },
    ],
  },
  {
    id: "lisbonne-t3",
    citySlug: "lisbonne",
    title: "L'arc oriental porte-t-il la promotion ?",
    anchor: { kind: "zone", label: "Marvila" },
    messages: [
      {
        id: "lisbonne-t3-m1",
        authorId: "B",
        time: "il y a 2 j",
        text: "Marvila 72, Beato 71, Lumiar 70. C'est là que le foncier laisse une marge. Le centre est écrasé par le prix du terrain.",
      },
      {
        id: "lisbonne-t3-m2",
        authorId: "A",
        time: "hier",
        text: "Oui, le foncier du centre absorbe 60 à 70% du prix de sortie. L'arc en régénération est la seule vraie fenêtre.",
      },
    ],
  },

  // ---------------- Porto ----------------
  {
    id: "porto-t1",
    citySlug: "porto",
    title: "Campanhã : activer le foncier de la gare ?",
    anchor: { kind: "asset", label: "Campanhã Souto de Moura" },
    messages: [
      {
        id: "porto-t1-m1",
        authorId: "B",
        time: "il y a 2 j",
        text: "Le projet Souto de Moura ressort en Go, marge de l'ordre de 15% sur GDV. Le foncier à 215 €/m² est le vrai levier. On engage ?",
      },
      {
        id: "porto-t1-m2",
        authorId: "A",
        time: "hier",
        text: "La régénération de la gare et le terminal intermodal soutiennent l'exécution. Campanhã est première au foncier et en constructibilité. Feu vert côté analyse.",
      },
      {
        id: "porto-t1-m3",
        authorId: "B",
        time: "il y a 3 h",
        text: "Parfait. On prépare la note d'engagement.",
      },
    ],
  },
  {
    id: "porto-t2",
    citySlug: "porto",
    title: "Campanhã seule en Go : est-ce robuste ?",
    anchor: { kind: "verdict", label: "Promotion · Go" },
    messages: [
      {
        id: "porto-t2-m1",
        authorId: "A",
        time: "il y a 3 j",
        text: "Campanhã 80/100, seule en Go. Son évolution récente est à -1,2% mais le pipeline de régénération porte le momentum. Le foncier le moins cher fait la marge.",
      },
      {
        id: "porto-t2-m2",
        authorId: "B",
        time: "il y a 2 j",
        text: "Le -1,2% ne me gêne pas si le pipeline est réel. C'est un point d'entrée, pas un signal de sortie.",
      },
    ],
  },
  {
    id: "porto-t3",
    citySlug: "porto",
    title: "Foz : prix haut, promotion sans marge ?",
    anchor: { kind: "zone", label: "Foz do Douro" },
    messages: [
      {
        id: "porto-t3-m1",
        authorId: "A",
        time: "il y a 2 j",
        text: "Foz reste chère à 3 932 €/m², mais l'évolution est à -0,7% et le foncier élevé : promotion Passer. C'est un marché de détention, pas de développement.",
      },
      {
        id: "porto-t3-m2",
        authorId: "B",
        time: "hier",
        text: "D'accord. On tient Foz pour le revenu, on développe à l'est.",
      },
    ],
  },

  // ---------------- Bruxelles ----------------
  {
    id: "bruxelles-t1",
    citySlug: "bruxelles",
    title: "Dansaert Quai : conversion bureau vers résidentiel ?",
    anchor: { kind: "asset", label: "Dansaert Quai · Molenbeek" },
    messages: [
      {
        id: "bruxelles-t1-m1",
        authorId: "B",
        time: "il y a 2 j",
        text: "Dansaert Quai ressort à 77/100, marge 14,8% à 4 080 €/m². Le hurdle projet est à 12%. La conversion tient si le foncier bureau reste à 780.",
      },
      {
        id: "bruxelles-t1-m2",
        authorId: "A",
        time: "hier",
        text: "La coque conservée limite le coût. La prime +49% vs médiane Molenbeek 2 740 est agressive, mais le quartier du canal se gentrifie vite.",
      },
      {
        id: "bruxelles-t1-m3",
        authorId: "B",
        time: "il y a 6 h",
        text: "On garde 4 080 en central, hurdle 12% assumé. Revue au comité.",
      },
    ],
  },
  {
    id: "bruxelles-t2",
    citySlug: "bruxelles",
    title: "Premium énergivore : céder avant le mur PEB 2033 ?",
    anchor: { kind: "verdict", label: "Détention · Céder" },
    messages: [
      {
        id: "bruxelles-t2-m1",
        authorId: "A",
        time: "il y a 3 j",
        text: "Le stock premium ancien, Ixelles et Uccle, est pénalisé par le capex PEB et le précompte. Les classes F et G seront interdites à la location en 2033.",
      },
      {
        id: "bruxelles-t2-m2",
        authorId: "B",
        time: "il y a 2 j",
        text: "Donc on arbitre le décoté rénovable et on cède l'énergivore avant l'échéance. L'arc du canal reste la priorité de développement.",
      },
    ],
  },
  {
    id: "bruxelles-t3",
    citySlug: "bruxelles",
    title: "L'arc du canal : promotion ou trop tôt ?",
    anchor: { kind: "zone", label: "Molenbeek" },
    messages: [
      {
        id: "bruxelles-t3-m1",
        authorId: "B",
        time: "il y a 2 j",
        text: "Molenbeek 79, Forest 74, Anderlecht 71. L'arc du canal cumule Go promotion et fenêtre d'arbitrage. C'est cohérent ?",
      },
      {
        id: "bruxelles-t3-m2",
        authorId: "A",
        time: "hier",
        text: "Oui : foncier accessible plus gentrification. On construit et on repositionne sur l'arc, on ne détient pas l'ancien énergivore.",
      },
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
    date: "2 juil. 2026",
    title: "Le neuf rive sud du Douro se raréfie",
    summary: "L'offre neuve côté fleuve reste sous la demande, les délais de vente se compriment sur Afurada et Santa Marinha.",
    impact: { zone: "Santa Marinha", note: "verdict promotion à surveiller" },
  },
  {
    id: "gaia-f2",
    citySlug: "gaia",
    source: "INE Estatísticas",
    date: "30 juin 2026",
    title: "Prix résidentiels : +16,3% sur douze mois à Gaia",
    summary: "La médiane du concelho atteint 2 474 €/m², portée par un second semestre accéléré.",
  },
  {
    id: "gaia-f3",
    citySlug: "gaia",
    source: "Público Economia",
    date: "27 juin 2026",
    title: "IMT : le barème 2026 relève les seuils de 2%",
    summary: "Les tranches d'acquisition sont réévaluées ; l'entrée reste autour de 6% du prix pour la résidence secondaire.",
  },
  {
    id: "gaia-f4",
    citySlug: "gaia",
    source: "ADENE",
    date: "24 juin 2026",
    title: "Certificats énergétiques : la trajectoire EPBD se précise",
    summary: "Le calendrier de rénovation du parc ancien se durcit ; les classes E et F concentrent le risque.",
    impact: { zone: "Santa Marinha", note: "détention à repricer sur l'énergie" },
  },
  {
    id: "gaia-f5",
    citySlug: "gaia",
    source: "Expresso Imobiliário",
    date: "20 juin 2026",
    title: "Le foncier bien desservi devient rare à Gaia",
    summary: "La réserve constructible proche du fleuve se contracte, la valeur résiduelle par usage grimpe.",
  },

  // Lisbonne
  {
    id: "lisbonne-f1",
    citySlug: "lisbonne",
    source: "Idealista News",
    date: "1 juil. 2026",
    title: "Marvila et Beato : l'arc oriental accélère",
    summary: "Les projets de reconversion se multiplient, la demande résidentielle suit le nouveau métro.",
    impact: { zone: "Marvila", note: "promotion à confirmer" },
  },
  {
    id: "lisbonne-f2",
    citySlug: "lisbonne",
    source: "INE Habitação",
    date: "29 juin 2026",
    title: "Lisbonne : +12,3% sur douze mois",
    summary: "La médiane municipale atteint 4 875 €/m², portée par le centre et l'axe du Tage.",
  },
  {
    id: "lisbonne-f3",
    citySlug: "lisbonne",
    source: "Jornal de Negócios",
    date: "25 juin 2026",
    title: "Alojamento Local : nouveau tour de vis attendu",
    summary: "Le cadre AL se resserre dans le centre historique ; la profondeur locative de détention se réduit.",
    impact: { zone: "Santa Maria Maior", note: "détention à surveiller" },
  },
  {
    id: "lisbonne-f4",
    citySlug: "lisbonne",
    source: "Público Local",
    date: "21 juin 2026",
    title: "Le foncier du centre reste hors de portée",
    summary: "Les valeurs de terrain intra-muros absorbent l'essentiel du prix de sortie, la promotion se déporte vers l'est.",
  },
  {
    id: "lisbonne-f5",
    citySlug: "lisbonne",
    source: "ADENE",
    date: "18 juin 2026",
    title: "Parc historique : l'exposition énergétique se confirme",
    summary: "Le centre concentre les classes E et F ; les échéances EPBD pèsent sur la détention ancienne.",
  },

  // Porto
  {
    id: "porto-f1",
    citySlug: "porto",
    source: "Jornal de Notícias",
    date: "2 juil. 2026",
    title: "Campanhã : le terminal intermodal entre en chantier",
    summary: "Le nouveau hub et la gare à grande vitesse redessinent l'arc est ; les investisseurs se positionnent sur le foncier.",
    impact: { zone: "Campanhã", note: "foncier à activer, verdict Go" },
  },
  {
    id: "porto-f2",
    citySlug: "porto",
    source: "INE Habitação",
    date: "28 juin 2026",
    title: "Porto : +10,0% sur douze mois",
    summary: "La médiane du concelho atteint 3 066 €/m² ; l'écart entre Foz et Campanhã reste marqué.",
  },
  {
    id: "porto-f3",
    citySlug: "porto",
    source: "Público Porto",
    date: "24 juin 2026",
    title: "Souto de Moura signe un projet mixte à Campanhã",
    summary: "Logement, bureaux et hôtel sur plus de 70 000 m² à la gare, livraison échelonnée.",
  },
  {
    id: "porto-f4",
    citySlug: "porto",
    source: "Idealista News",
    date: "19 juin 2026",
    title: "Foz : les prix tiennent, les volumes ralentissent",
    summary: "Le haut de marché se stabilise ; la promotion neuve y reste marginale.",
  },
  {
    id: "porto-f5",
    citySlug: "porto",
    source: "Diário Imobiliário",
    date: "16 juin 2026",
    title: "Bonfim et Paranhos : la couronne se réveille",
    summary: "La croissance récente déborde du centre vers l'arc de régénération.",
    impact: { zone: "Bonfim", note: "landbank secondaire à phaser" },
  },

  // Bruxelles
  {
    id: "bruxelles-f1",
    citySlug: "bruxelles",
    source: "L'Echo Immo",
    date: "1 juil. 2026",
    title: "Le canal de Bruxelles attire les reconversions",
    summary: "Molenbeek, Anderlecht et Forest concentrent les projets, portés par un foncier encore accessible.",
    impact: { zone: "Molenbeek", note: "promotion Go à confirmer" },
  },
  {
    id: "bruxelles-f2",
    citySlug: "bruxelles",
    source: "Statbel",
    date: "27 juin 2026",
    title: "Prix du logement : l'arc du canal en tête des hausses",
    summary: "Les communes du canal affichent la plus forte progression sur cinq ans ; le sud-est plafonne.",
  },
  {
    id: "bruxelles-f3",
    citySlug: "bruxelles",
    source: "Le Soir Immo",
    date: "23 juin 2026",
    title: "PEB : l'échéance 2033 se rapproche",
    summary: "Les classes F et G seront interdites à la location ; le stock premium ancien doit se rénover.",
    impact: { zone: "Ixelles", note: "détention à céder avant le mur" },
  },
  {
    id: "bruxelles-f4",
    citySlug: "bruxelles",
    source: "Trends-Tendances",
    date: "20 juin 2026",
    title: "Précompte immobilier : la pression fiscale pèse sur la détention",
    summary: "Le rendement net bruxellois reste bas ; le capex énergétique alourdit encore l'équation.",
  },
  {
    id: "bruxelles-f5",
    citySlug: "bruxelles",
    source: "La Libre Éco",
    date: "17 juin 2026",
    title: "Ligne 3 de métro : le nord se désenclave",
    summary: "La future desserte renforce l'attractivité de l'arc du canal et la constructibilité.",
  },
];

// --- Fil d'activité (dérivé des discussions et du fil d'info) -------------

const ACTIVITY: ActivityItem[] = [
  // Gaia
  { id: "gaia-a1", citySlug: "gaia", authorId: "B", time: "il y a 5 h", text: "a répondu sur le prix de sortie de Haya Towers" },
  { id: "gaia-a2", citySlug: "gaia", authorId: "A", time: "hier", text: "a partagé une info sur le foncier rive sud" },
  { id: "gaia-a3", citySlug: "gaia", authorId: "A", time: "il y a 2 j", text: "a signalé un point sur São Félix da Marinha" },
  { id: "gaia-a4", citySlug: "gaia", authorId: "B", time: "il y a 2 j", text: "a lancé une discussion sur Haya Towers" },

  // Lisbonne
  { id: "lisbonne-a1", citySlug: "lisbonne", authorId: "B", time: "il y a 4 h", text: "a répondu sur le prix de sortie de Formoso" },
  { id: "lisbonne-a2", citySlug: "lisbonne", authorId: "A", time: "hier", text: "a partagé une lecture de l'arc oriental" },
  { id: "lisbonne-a3", citySlug: "lisbonne", authorId: "A", time: "il y a 3 j", text: "a signalé le piège du loyer facial au centre" },
  { id: "lisbonne-a4", citySlug: "lisbonne", authorId: "B", time: "il y a 2 j", text: "a lancé une discussion sur la détention du centre historique" },

  // Porto
  { id: "porto-a1", citySlug: "porto", authorId: "B", time: "il y a 3 h", text: "a répondu sur l'engagement de Campanhã" },
  { id: "porto-a2", citySlug: "porto", authorId: "A", time: "hier", text: "a partagé une info sur le terminal intermodal" },
  { id: "porto-a3", citySlug: "porto", authorId: "A", time: "il y a 2 j", text: "a signalé la promotion sans marge à Foz" },
  { id: "porto-a4", citySlug: "porto", authorId: "B", time: "il y a 2 j", text: "a lancé une discussion sur le foncier de la gare" },

  // Bruxelles
  { id: "bruxelles-a1", citySlug: "bruxelles", authorId: "B", time: "il y a 6 h", text: "a répondu sur la conversion de Dansaert Quai" },
  { id: "bruxelles-a2", citySlug: "bruxelles", authorId: "A", time: "hier", text: "a partagé une lecture de l'arc du canal" },
  { id: "bruxelles-a3", citySlug: "bruxelles", authorId: "A", time: "il y a 3 j", text: "a signalé le mur PEB 2033 sur le premium" },
  { id: "bruxelles-a4", citySlug: "bruxelles", authorId: "B", time: "il y a 2 j", text: "a lancé une discussion sur l'arc du canal" },
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
