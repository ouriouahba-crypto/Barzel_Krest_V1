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
  `detailScore`, `hayaProps`, etc.
- **Composants** : `Header` (titre, ligne marché, recherche multi-freguesias,
  sélecteurs MODE + CLASSE), `Sidebar` (modules + Export PDF + IA Analyste
  désactivée), `GaiaMap` (Leaflet), `DetailPanel` + `HayaSlider` (curseur prix Haya,
  recalcul marge live — **NE PAS MODIFIER**), `KeyFigures`, `ScoreCards`,
  `CityCharts`, `CityBits` (`MapLegendBar`, `RankingList`), `ui.tsx`
  (`VerdictBadge`, `ScoreDial`, `PillarBar`, `Segmented`, `MultiSelect`).
- **Pages** : `app/gaia` (Carte), `app/vue-ensemble` (Vue d'ensemble).
- **Libs** : `lib/api.ts` (client + types), `lib/scoring.ts` (couleurs, verdicts,
  médiane, config KPI par mode, formule Haya), `lib/normalize.ts` (clé de jointure
  GeoJSON ↔ zone_name).

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

### Prochaines pages de mode (gabarit = Prix & marge)
Rendement (détention), Arbitrage, Foncier (landbank). Réutiliser la structure :
KPIs → tableau triable → décomposition/piliers → graphe. Chaque page épingle son
mode ; exposer si besoin un `breakdown` structuré sur le pilier natif du mode.
