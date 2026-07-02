# Barzel Analytics — CLAUDE.md

Démo d'intelligence immobilière pour le client **KREST**. Ce fichier est le fil
conducteur : contexte, conventions et journal d'avancement. Je le tiens à jour au
fur et à mesure.

---

## 1. Le projet en bref

- **Monorepo** `barzel_Krest_v1` : backend FastAPI (Python, pandas) + frontend
  Next.js 14 (`frontend/`, TypeScript, Tailwind, Leaflet, Recharts, zustand).
- **Ville de démo** : Vila Nova de Gaia (15 freguesias, contours réels dans
  `frontend/public/geo/gaia_freguesias.geojson`, propriété `freguesia`).
- **Actif phare** : Haya Towers, à Santa Marinha e São Pedro da Afurada
  (zone id `santamarinhaesaopedrodaafurada`).

### Charte graphique
| Rôle | Valeur |
|------|--------|
| Navy | `#0A1628` (+ `navy.800/700/600`) |
| Or | `#C9A86A` (+ `gold.600 #B8965A`, `gold.300 #E0CBA0`) |
| Cream | `#F3EEE3` (+ `cream.200 #FBF9F4`) |
| Ink / Muted | `#243447` / `#6B7A8D` |
| Titres | Playfair Display (`font-display`) |
| Corps | Montserrat (`font-sans`) |

Échelle de score (séquentiel) : rouge `#9E5B5B` → or `#C9A86A` → vert `#2F6B3D`
(`scoreColor()` dans `frontend/lib/scoring.ts`).

### Posture produit (règles dures)
- **Jamais** afficher : « simulation », « confiance », les sources, ni les
  paramètres bruts de `backend/data/params.json`. Le backend `_clean()` retire
  déjà `data_confidence_index`, `confidence`, `source`, `krest`, etc.
- Là où la donnée manque, on simule du réaliste — sans le dire.
- Les **économies dérivées par freguesia** (marge, coût de revient, foncier,
  prix neuf réalisable) *sont* le sujet des pages de module : elles s'affichent.
  Ce sont les *knobs* de params.json qui restent cachés, pas leurs résultats.

---

## 2. Backend (scoring)

Moteur : `backend/services/mode_scoring.py`, routé par `backend/routers/scoring.py`.

**Endpoints** (base `http://localhost:8000`) :
- `GET /api/scoring/city?city=gaia&mode=..&class=..` → freguesias classées.
- `GET /api/scoring/zone?zone=..&mode=..&class=..` → 1 zone (ou 4 modes si `mode` omis).
- `GET /api/scoring/asset?asset=haya` → l'actif KREST (4 modes + primary).

**4 modes** : `promotion`, `detention`, `arbitrage`, `landbank`.
**5 classes** : `residential`, `office`, `hotel`, `logistics`, `retail`.

Chaque réponse : `total` /100, `verdict`, `pillars[]` (chacun `subscore`,
`native {value,unit,label}`, `why`, `weight`, `applicable`), plus `median_eur_m2`,
`price_eur_m2`, `yoy_pct`, `n_transactions`.

Économie promotion (pilier `marge`) : `coût = construction + foncier + frais annexes
(dev_cost_stack 18%) + financement (LTV 60% × dette 4,5% × 3 ans)`, puis
`marge = (prix net TVA − coût) / coût`. Pour l'actif Haya la formule client se
condense en `coût = 1,261 × (construction + foncier)` (cf. `HAYA` dans scoring.ts).

> ⚠️ Le process `uvicorn` tourne **sans `--reload`** → après toute édition backend,
> le relancer : `python -m uvicorn backend.main:app --port 8000 --log-level warning`.

---

## 3. Frontend — ce qui existe (à réutiliser sans casser)

- **Hook** `lib/useGaia.ts` : état partagé (mode, classe, focusZone), cache par
  `mode|classe` (`cityByKey`), prefetch des 4 modes de la classe courante, refetch
  zone/classe. Expose `figures`, `chartRows`, `scoresByNorm`, `freguesias`,
  `promoCity`, `citiesByMode` (4 modes de la classe), `detailScore`, `hayaProps`, etc.
- **Composants** : `Header` (titre, ligne marché, recherche multi-freguesias,
  sélecteurs MODE + CLASSE ; prop `hideMode` pour masquer MODE), `Sidebar` (modules
  + Export PDF + IA Analyste désactivée), `GaiaMap` (Leaflet, **exclusif page Carte**),
  `DetailPanel` + `HayaSlider` (curseur prix Haya, recalcul marge live — **NE PAS
  MODIFIER**), `OverviewRanking` (classement horizontal par verdict), `PriceMargin*`
  (module Prix & marge), `ui.tsx` (`VerdictBadge`, `ScoreDial` avec prop `light` pour
  fond clair, `PillarBar`, `Segmented`, `MultiSelect`). `KeyFigures`, `ScoreCards`,
  `CityCharts`, `CityBits` existent encore mais ne sont plus utilisés par la Vue
  d'ensemble refondue (réutilisables).
- **Pages** : `app/gaia` (Carte), `app/vue-ensemble` (Vue d'ensemble, sans carte),
  `app/prix-marge` (Prix & marge).
- **Libs** : `lib/api.ts` (client + types), `lib/scoring.ts` (couleurs, verdicts,
  médiane, config KPI par mode, formule Haya), `lib/normalize.ts` (clé de jointure
  GeoJSON ↔ zone_name), `lib/priceMargin.ts` (lignes Prix & marge), `lib/insights.ts`
  (générateur d'insights déterministe — voir §5).

### Conventions
- Client components (`"use client"`), imports via alias `@/`.
- Liens fichiers cliquables en markdown `[texte](chemin)`.
- Chiffres FR : `toLocaleString("fr-FR")`, unités `€/m²`, `%`.
- Captures : `playwright-core` (channel `chrome`, headless), scripts dans
  `frontend/shots/`. Frontend sur `:3000`.

---

## 4. Journal d'avancement

### Tâche en cours — Page **Prix & marge** (route `/prix-marge`)
Première vraie page de module. Centrée sur la **promotion**, réactive à la
**classe** (résidentiel par défaut). Sert de gabarit aux 3 autres pages de mode.

Contenu attendu :
1. En-tête : titre « Prix & marge » + ligne de contexte promotion à Gaia + sélecteur de classe.
2. Rangée de 4 chiffres clés (marge médiane, freguesia la plus rentable, prix neuf réalisable médian, coût de revient médian).
3. Tableau par freguesia, triable, liseré de score + puce verdict (colonnes : prix ancien médian, prime neuf %, prix neuf réalisable, coût construction, foncier, coût total, marge %, verdict). Clic ligne → sélection + cascade.
4. Cascade de décomposition de marge de la freguesia sélectionnée (Afurada par défaut) ; HayaSlider accessible pour Afurada/résidentiel.
5. Graphe marge % par freguesia (barres par verdict).

Décisions de conception :
- **Backend** : le détail des coûts (construction, foncier, frais annexes,
  financement, prix neuf réalisable, prime) n'était que dans le texte `why` du
  pilier `marge`. J'ajoute un objet structuré `breakdown` au pilier `marge`
  (économies dérivées, pas de params/confiance exposés) — additif, ne casse rien.
- **Mode épinglé à promotion** sur cette page ; le sélecteur de classe est le
  contrôle actif (conforme à « sélecteur de classe actif, résidentiel par défaut »).

Statut : **✅ Livré** (2026-07-02)
- [x] Exploration du codebase (backend + frontend) et de la charte.
- [x] CLAUDE.md créé.
- [x] Backend : objet `breakdown` sur le pilier `marge` (`mode_scoring.py`).
      → Redémarrer uvicorn après édition (process sans `--reload`).
- [x] Libs frontend : `MargeBreakdown` + `breakdown?` (`api.ts`), `verdictColor`
      (`scoring.ts`), `promoCity`/`hayaZone` (`useGaia.ts`), module partagé
      `lib/priceMargin.ts` (`pmRows`, `pmSummary`, formatters).
- [x] Composants : `PriceMarginTable` (triable, liseré score, badge verdict),
      `MarginWaterfall` (cascade flottante), `MarginBars` (barres par verdict).
- [x] Page `app/prix-marge/page.tsx` + lien activé dans `Sidebar`.
- [x] Captures 1440px : `shots/prixmarge_residentiel_afurada.png` +
      `shots/prixmarge_bureaux.png` (script `shots/capture_prixmarge.js`).

Vérifié : `tsc --noEmit` OK ; routes `/prix-marge`, `/vue-ensemble`, `/gaia` → 200
(pas de régression). Réactivité classe confirmée (résidentiel vs bureaux).

**Piège rencontré (à retenir pour les 3 prochaines pages de mode)** :
- La page scrolle dans `<main>` (flex-col), pas dans le document → un enfant flex
  avec `overflow-auto` interne est compressé à ~0 (min-content = 0). Solution :
  `shrink-0` sur les cartes hautes (tableau, cascade, graphe) et hauteur naturelle.
- `fullPage:true` de Playwright ne marche pas (scroll interne) : mesurer
  `header.offsetHeight + main.scrollHeight` et agrandir le viewport avant le shot.

### Lot QA Prix & marge — **✅ Livré** (2026-07-02, 8 points)
1. **Calibration foncier/marges résidentiel** (params.json) : prime neuf + foncier
   par freguesia résolus pour cibler les marges. Afurada 30 %, Madalena 29 % (tête),
   Canidelo 24 % (foncier remonté 150→557), rien > 32 % hors Haya, ruraux -5…-16 %.
2. **Logistique bornée** : `land_pct` 12→26 et facteurs de zone compressés (×0,30
   autour de 1,0), construction/yield inchangés → marges 6,7…15,1 %.
3. **Prime neuf variable** par freguesia (24-38 %, croissante avec l'attractivité)
   dans `new_build_premium_by_zone` ; le moteur la lisait déjà par zone.
4. **Garde-fou verdict promotion** (`_promotion_verdict_cap` dans `mode_scoring.py`) :
   marge < 0 → plafond « Passer » ; 0 ≤ marge < 8 % → plafond « Conditionnel ».
   Test : `test_promotion_verdict_cap_rule` + `..._city_verdicts_respect_margin`.
5. **KPI médianes sur freguesias viables** (Go+Conditionnel), repli « toutes
   freguesias » (`pmSummary.scope`) ; sous-libellé dynamique sur la page.
6. **Colonnes commercial** : Prix ancien + Prime neuf masquées hors résidentiel
   (tableau 9→7 colonnes, prop `residential` sur `PriceMarginTable`).
7. **Cascade marge négative** : état « = Perte » rouge #9E5B5B, barre pleine largeur
   à opacité 0,25, valeur négative, sans clamp (`MarginWaterfall`).
8. **Sélecteur MODE masqué** sur Prix & marge via prop optionnelle `hideMode` sur
   `Header` (Carte et Vue d'ensemble inchangées).

Interdits respectés : HayaSlider intact (marge 35,5 %, prime 111 %), aucun paramètre
brut ni indice de confiance exposé, `_clean` inchangé.

**Fourchettes de marge de promotion par classe (freguesias Gaia)** :

| Classe       | min    | max    | médiane | statut |
|--------------|--------|--------|---------|--------|
| Résidentiel  | -16,0 %| 30,0 % | 5,0 %   | recalibré (P1/P3) |
| Bureaux      | -11,0 %| 19,8 % | 3,1 %   | inchangé |
| Hôtellerie   | -15,9 %| 18,7 % | 4,3 %   | inchangé |
| Logistique   |  6,7 % | 15,1 % | 12,0 %  | recalibré (P2) |
| Commerce     |  1,0 % | 20,5 % | 10,5 %  | inchangé |

Actif Haya (hors classement zone) : marge 35,5 % — intouchable.
Captures : `shots/prixmarge_{residentiel_afurada,bureaux,logistique}.png`.

### Refonte Vue d'ensemble — **✅ Livré** (2026-07-02)
Objectif : « cette ville vaut-elle notre attention, par quel mode, et où » en un
écran 1440px. **Aucune carte** (exclusivité page Carte).
Structure (`app/vue-ensemble/page.tsx`) :
a) Bandeau verdict navy pleine largeur : `cityInsight` en Playfair cream, chiffres
   en or (`highlightNums`) ; à droite score du meilleur mode + `VerdictBadge`.
b) 4 cartes de mode (`ScoreDial`, `VerdictBadge`, indicateur natif, `modeInsight`) ;
   seule Promotion porte un lien « Explorer » → /prix-marge, les autres « Bientôt »
   (aucun contrôle mort).
c) « Où » 2 colonnes : podium top 3 freguesias (score/verdict/métrique native du
   mode dominant) + `OverviewRanking` (barres horizontales par verdict).
d) Ligne contexte marché discrète (prix médian, yoy, transactions, nb freguesias) —
   remplace les 5 grosses cartes KPI.
Supprimés de cette page : carte Leaflet, `KeyFigures`, `ScoreCards`, `CityCharts`,
`DetailPanel`. `hideMode` sur le Header (les 4 modes sont montrés d'un coup).
Correctifs QA : élision « marché **d'**arbitrage » ; `ScoreDial` prop `light`
(texte navy) pour les fonds clairs (podium). Captures :
`shots/vue_ensemble_{residentiel,bureaux}.png`. Meilleur mode par classe :
résidentiel/commerce → promotion, bureaux/hôtel/logistique → arbitrage.

### `lib/insights.ts` — générateur d'insights déterministe (réutilisable)
Fonctions **pures**, sans IA : templates FR + chiffres réels du scoring, jamais de
texte générique. À réutiliser sur les futures pages de mode.
- `bestMode(scores)` → mode au score municipio max (ou `null`).
- `cityInsight(data, assetClass)` → 1 phrase verdict ville : meilleur mode, nombre
  de freguesias au verdict haut, fourchette de la métrique native dominante, driver
  (prime neuf en promotion, appétit en arbitrage). Cas dégradé si aucune freguesia
  au verdict haut. Élision `de`/`d'`.
- `modeInsight(score, assetClass)` → 1 phrase courte par mode citant sa métrique
  native (marge / rendement / spread / constructibilité) ; repli sur le verdict.
- Entrée `OverviewByMode { scores: municipio par mode ; freg: freguesias par mode }`
  — se construit depuis `useGaia().citiesByMode` (municipio = niveau `municipio`).
- Rendu des chiffres en or : `highlightNums()` dans la page (regex sur les tokens
  numériques), pas dans le module (qui reste pur, sans JSX).

### Lot QA Vue d'ensemble #2 — **✅ Livré** (2026-07-02, 4 points)
1. **Bandeau — meilleure opportunité** : le bloc droit montre désormais la freguesia
   au score le plus haut du mode dominant (« Meilleure opportunité · <Mode> », nom
   court + `VerdictBadge` + `ScoreDial`). Repli sur le **score municipal** en cas
   dégradé (aucune freguesia au verdict haut). Le score municipal reste sur les
   4 cartes de mode.
2. **Constructibilité par freguesia** : 15 valeurs (34-71, gradient front de fleuve/
   urbain 60-75 → rural sud 30-45, aucun multiple de 5) ajoutées dans
   **`backend/data/params.json` → `zones`** (le fichier que le moteur lit ; le défaut
   pays reste le repli). ⚠️ `barzel_data_backbone_v0.json` (racine) ne contient que
   Lisbonne/Bruxelles, **aucune Gaia**, et n'est chargé par aucun code — il n'était
   donc pas le bon endroit. Effet : scores **landbank étalés 19,7-73,8** (médiane
   42,1), constructibilité médiane **51** (plus 50 pile). Effet de bord assumé : le
   pilier `constructibilite` étant aussi un pilier promotion, Canidelo passe
   Conditionnel → **Go** (marges inchangées : la marge ne dépend pas de la
   constructibilité) → résidentiel a maintenant **3 freguesias Go** (Madalena,
   Afurada, Canidelo), insight « marges de 24 à 30 % ». Captures Prix & marge
   régénérées en conséquence.
3. **Driver arbitrage qualitatif** (`insights.ts`) : `>=0,7` « appétit institutionnel
   soutenu », `0,4-0,7` « modéré », `<0,4` clause supprimée (fini le « 0.70 » brut).
4. **Cas dégradé** (`insights.ts`) : au lieu de la fourchette complète, cite le
   meilleur : « , meilleur <kpi> <valeur> à <freguesia> » (rangePhrase au singulier,
   sans « de »). Ex. hôtellerie : « …meilleur spread 20% à Santa Marinha. »

Captures : `shots/vue_ensemble_{residentiel,bureaux,hotellerie}.png`. Vérifs : `tsc`
OK, tests backend OK (dont garde-fous verdict), routes 200.

### Prochaines pages de mode (gabarit = Prix & marge)
Rendement (détention), Arbitrage, Foncier (landbank). Réutiliser la structure :
KPIs → tableau triable → décomposition/piliers → graphe, **+ `modeInsight`/`cityInsight`
de `lib/insights.ts`** pour les phrases de synthèse. Chaque page épingle son mode ;
exposer si besoin un `breakdown` structuré sur le pilier natif du mode.
