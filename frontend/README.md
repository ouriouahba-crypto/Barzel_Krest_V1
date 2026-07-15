# Barzel — Frontend (dashboard ville)

Next.js 14 (App Router, TypeScript, Tailwind, Leaflet). Gabarit **Vila Nova de
Gaia** : une ville parfaite à dupliquer sur les autres. Charte navy `#0A1628` /
or `#C9A86A` / cream `#F3EEE3`, titres Playfair Display, corps Montserrat.

## Lancer

```bash
# 1) Backend (à la racine du repo)
uvicorn backend.main:app --port 8000

# 2) Frontend
cd frontend
npm install
npm run dev            # http://localhost:3000/gaia
```

`NEXT_PUBLIC_API_BASE` (dans `.env.local`) pointe vers l'API (défaut
`http://localhost:8000`). Le CORS est ouvert côté backend pour le dev.

## Structure

```
app/
  layout.tsx          fonts (next/font) + charte
  page.tsx            redirige vers /gaia
  gaia/page.tsx       orchestrateur : état (mode, classe, sélection), fetches, layout
components/
  Header.tsx          bandeau : titre, market line, recherche multi-freguesias, sélecteurs MODE + CLASSE
  Sidebar.tsx         modules + Export PDF + "IA Analyste" (désactivé)
  GaiaMap.tsx         choroplèthe Leaflet (client, ssr:false) + repère or Haya
  DetailPanel.tsx     panneau droite : piliers + chiffres clés
  HayaSlider.tsx      moment tactile : curseur prix, marge/verdict recalculés en direct
  ui.tsx              VerdictBadge, ScoreDial, PillarBar, Segmented, MultiSelect
lib/
  api.ts              client API typé (réponses sans confiance/source)
  scoring.ts          couleurs, verdicts, formule marge Haya (identique backend)
  normalize.ts        jointure geojson "freguesia" ↔ zone_name backend
public/geo/gaia_freguesias.geojson   15 freguesias réelles
```

## Points clés d'implémentation

- **Changement de mode** : recolore la carte (échelle rouge sourd → or → vert
  sourd), recharge les 4 scores, met en avant la carte du mode actif.
- **Jointure carte↔data** : `normFreguesia()` (minuscule, sans accents, sans
  préfixe « União das freguesias de »). 15/15 freguesias appariées ; Santa
  Marinha e S.P. da Afurada = zone de Haya.
- **Moment Haya** : ouvrir Santa Marinha (ou cliquer le repère or) en mode
  Promotion affiche le cas actif via `/api/scoring/asset?asset=haya`, avec un
  curseur sur le prix réalisable. Marge = `(prix net TVA − coût)/coût`,
  `coût = 1,261 × (construction + foncier)` — recalcul 100 % client, la prime
  sur la médiane réelle (2721 €/m²) évolue en direct. Au prix de base (5750),
  le total retombe exactement sur le score API.
- **Posture démo** : aucune étiquette de source ni indice de confiance à
  l'écran (le backend les retire déjà des réponses d'affichage).

## Points restants

- **Autres villes** : le gabarit est paramétré par `CITY`/geojson ; dupliquer
  `app/gaia` → `app/lisbonne`, `app/bruxelles`… + déposer le geojson de contours.
  Envisager une route dynamique `app/[city]/page.tsx` avec un registre de villes.
- **IA Analyste** : emplacement présent (désactivé), à brancher.
- **Export PDF** : utilise `window.print()` (feuille de style print à peaufiner) ;
  brancher un vrai export si besoin.
- **Sécurité** : bumper Next au dernier patch (avis 2025-12-11) avant prod.
- **Classe d'actif sur la carte** : la choroplèthe colore avec la classe par
  défaut (résidentiel) ; les cartes/détail utilisent la classe sélectionnée.
  Pour aligner, exposer `class` sur `/api/scoring/city`.
- **Modules sidebar** : seuls Carte / Vue d'ensemble sont câblés au centre ; les
  autres (Comparer, Rendement, Foncier…) sont des ancres à développer.
