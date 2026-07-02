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
`marge = (prix de vente − coût) / coût`. Pour l'actif Haya la formule client se
condense en `coût = 1,261 × (construction + foncier)` (cf. `HAYA` dans scoring.ts).

> **Convention fiscale — vente de logements neufs (résidentiel) :**
> - **Portugal : PAS de TVA sur la vente** (l'IMT est côté acquéreur ; la TVA amont
>   sur la construction est un coût du promoteur, réputé inclus dans la construction).
>   Le prix de vente = prix réalisable brut. → `_promo_marge` met `vat = 0` pour
>   `class == residential and country == "pt"`.
> - **Commercial** (toutes classes non résidentielles) : TVA récupérable → neutre (0).
> - **Belgique résidentiel** : conserve sa TVA pour l'instant (à revoir).

> ⚠️ **Lancement backend — toujours `python3`, jamais `python`** : sur cette machine
> `python` = anaconda (`/opt/anaconda3`), qui n'a **pas** uvicorn → « No module named
> uvicorn », le process meurt aussitôt et le proxy front répond 503 sur `/api/*`.
> Commande : `python3 -m uvicorn backend.main:app --reload --port 8000`
> (Python 3.13 framework, uvicorn 0.30.1). Le process tourne désormais en `--reload` ;
> s'il ne répond plus, vérifier d'abord `lsof -iTCP:8000` (souvent il est juste mort).

---

## 3. Frontend — ce qui existe (à réutiliser sans casser)

- **Hook** `lib/useGaia.ts` : état partagé (mode, classe, focusZone), cache par
  `mode|classe` (`cityByKey`), prefetch des 4 modes de la classe courante, refetch
  zone/classe. Expose `figures`, `chartRows`, `scoresByNorm`, `freguesias`,
  `promoCity`, `detentionCity`, `citiesByMode` (4 modes de la classe), `detailScore`,
  `hayaProps`, etc.
- **Composants** : `Header` (titre, ligne marché, recherche multi-freguesias,
  sélecteurs MODE + CLASSE ; prop `hideMode` pour masquer MODE), `Sidebar` (modules
  + Export PDF + IA Analyste désactivée), `GaiaMap` (Leaflet, **exclusif page Carte**),
  `DetailPanel` + `HayaSlider` (curseur prix Haya, recalcul marge live — **NE PAS
  MODIFIER**), `OverviewRanking` (classement horizontal par verdict), `PriceMargin*`
  (module Prix & marge), `RendementTable` + `YieldWaterfall` (module Rendement),
  `ArbitrageTable` + `SpreadWaterfall` (module Arbitrage),
  **briques génériques de page de mode** : `Waterfall` (cascade base − déductions =
  résultat, état perte inclus ; `MarginWaterfall`/`YieldWaterfall` n'en sont que des
  habillages) et `MarginBars` (barres par verdict, paramétré `metric`/`title`/
  `metricLabel`/`digits`, légende par mode), `ui.tsx` (`VerdictBadge`, `ScoreDial`
  avec prop `light` pour fond clair, `PillarBar`, `Segmented`, `MultiSelect`).
  `KeyFigures`, `ScoreCards`, `CityCharts`, `CityBits` existent encore mais ne sont
  plus utilisés par la Vue d'ensemble refondue (réutilisables).
- **Pages** : `app/gaia` (Carte), `app/vue-ensemble` (Vue d'ensemble, sans carte),
  `app/prix-marge` (Prix & marge), `app/rendement` (Rendement), `app/arbitrage`
  (Arbitrage).
- **Libs** : `lib/api.ts` (client + types), `lib/scoring.ts` (couleurs, verdicts,
  médiane, config KPI par mode, formule Haya), `lib/normalize.ts` (clé de jointure
  GeoJSON ↔ zone_name), `lib/priceMargin.ts` (lignes Prix & marge), `lib/rendement.ts`
  (lignes Rendement), `lib/arbitrage.ts` (lignes Arbitrage), `lib/insights.ts`
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
| Résidentiel  |  -8,0 %| 30,0 % | 6,0 %   | **recalibré sans TVA (lot #6)** |
| Bureaux      | -11,0 %| 19,8 % | 3,1 %   | inchangé |
| Hôtellerie   | -15,9 %| 18,7 % | 4,3 %   | inchangé |
| Logistique   |  6,7 % | 15,1 % | 12,0 %  | recalibré |
| Commerce     |  1,0 % | 20,5 % | 10,5 %  | inchangé |

Actif Haya : marge **35,5 %** à 5750 €/m² (prime +111%) — cf. lot #6.
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
`shots/vue_ensemble_{residentiel,bureaux,hotellerie}.png`. Meilleur mode par classe
(après enrichissement constructibilité, lot #3) : résidentiel/logistique/commerce →
promotion, bureaux/hôtel → arbitrage.

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

### Lot QA Vue d'ensemble #3 — **✅ Livré** (2026-07-02, 4 points)
1. **Constructibilité municipio = médiane des freguesias** (`mode_scoring.py`
   `_zone_attr`) : un zone `municipio` hérite de la médiane de constructibilité de
   ses freguesias au lieu du défaut pays. La carte Landbank affiche « constructibilité
   **51** » (plus 50). Repli défaut pays pour les villes non enrichies.
2. **Label natif arbitrage qualitatif** (backend `_native_indicator` + `_appetit_qual`) :
   `native_indicator` remplace « appétit 0.55 » par « appétit soutenu » (≥0,7) /
   « modéré » (0,4-0,7) / « faible » (<0,4) — même seuillage que l'insight.
3. **Accents d'affichage** : `verdictLabel()` dans `lib/scoring.ts` (mapping pur
   d'affichage : Fenetre ouverte→Fenêtre ouverte, etroite→étroite, fermee→fermée,
   Ceder→Céder). Utilisé dans `VerdictBadge` + tooltips `OverviewRanking`/`MarginBars`.
   **Les chaînes backend et les comparaisons restent brutes** (verdictTone,
   verdictColor, GOOD_WORD). Backend : « meilleur usage hotel » → « hôtel »
   (`_CLS_FR`, labels seulement, clés canoniques inchangées).
4. **Scories de label** : `_native_indicator` ne joint plus que les segments non
   vides (fini « marge 14% · n/a » → « marge 14% »). `modeInsight` landbank reformulé
   pour ne plus dupliquer la constructibilité : « Réserve foncière à activer :
   meilleur usage <usage> à <prix> €/m². »

Effet de bord (constructibilité → totaux promotion) : **logistique** bascule dominant
arbitrage → **promotion**. HayaSlider intact, `_clean` inchangé, aucun paramètre brut
exposé. Vérifs : `tsc` OK, tests backend OK, 5 classes contrôlées sur /vue-ensemble.

### Lot QA Vue d'ensemble #4 — **✅ Livré** (2026-07-02, 2 points)
1. **Insight gradué** (`cityInsight`) : le verbe d'ouverture dépend du score municipal
   du mode dominant — ≥60 « <Ville> est un marché de <mode> », 50-60 « <Ville> penche
   vers la/l'<mode> » (élision), <50 « <Ville> n'offre pas de lecture dominante ce
   cycle : la/l'<mode> ressort en tête avec … ». Le reste (freguesias, fourchette,
   driver) inchangé. Bonus : accord de genre `meilleur/meilleure` dans le cas dégradé
   (« meilleure marge », « meilleur spread »). Rendus : résidentiel (58,5) & logistique
   (52,8) → « penche vers la promotion » ; bureaux (60,9) & commerce (62,7) → « est un
   marché de/d' » ; hôtellerie reste dégradé.
2. **Hiérarchie résidentielle** (`data/listings_sim.csv`, absorption seule, marges
   intactes) : Santa Marinha DOM 74→61 (plus rapide), Madalena 70→73 → **Santa Marinha
   86,5 > Madalena 83,2 > Canidelo 71,0** (marges 30/29/24 inchangées). Le héros du
   bandeau est désormais « Meilleure opportunité : Santa Marinha ».

⚠️ **Interaction P1×P2 à signaler** : l'absorption est **class-indépendante** (DOM
partagé). Baisser Madalena pour la hiérarchie résidentielle l'a fait passer sous 70 en
**promotion logistique** — c'était son **seul Go**. Résultat : logistique bascule en
**dégradé** (« Gaia reste sélectif en logistique : aucune freguesia Go en promotion ce
cycle, meilleure marge 15% à Sandim »), pas « penche vers ». Impossible d'avoir à la
fois une hiérarchie résidentielle nette ET un Go logistique (Santa Marinha logistique
est plafonnée Conditionnel par sa marge 6,7% < 8%). Choix retenu : P2 (cible explicite)
prioritaire ; l'insight logistique dégradé reste exact. Réversible si arbitrage inverse
souhaité.

HayaSlider intact, `_clean` inchangé, aucun paramètre brut exposé. Vérifs : `tsc` OK,
tests backend OK, 5 classes contrôlées.

### Lot QA Prix & marge #2 — couche insight — **✅ Livré** (2026-07-02, 4 points)
1. **`components/InsightBanner.tsx`** — bandeau verdict extrait de la Vue d'ensemble
   (fond navy, phrase Playfair cream, chiffres en or via `highlightNums`, bloc droit
   optionnel). Props `{ eyebrow, sentence, right? }`. Utilisé par **Vue d'ensemble**
   (aucun changement visuel) **et Prix & marge**.
2. **`priceMarginInsight(rows, class)`** (`insights.ts`, promotion) : compte les
   freguesias viables (Go+Conditionnel), cite les 2-3 meilleures avec leur marge,
   explique pourquoi le reste ne porte pas. Verbe gradué (1/2/≥3 viables ; 0 →
   dégradé). Ex. « 7 freguesias portent la promotion résidentielle : Santa Marinha
   (30%), Madalena (29%) et Canidelo (24%). Au-delà, le prix neuf réalisable ne couvre
   plus le coût de revient. » Bloc droit du bandeau : « Marge max · <freguesia> ».
3. **`marginAnomalyNote(scores, class)`** : cherche une freguesia marge ≥ 8% mais
   verdict Passer, nomme son pilier le plus faible comme raison ; sinon `null` (rien
   affiché). Rendu discret « Note d'analyse · … » sous le tableau. Ex. « São Félix da
   Marinha affiche 11% de marge mais un marché trop étroit pour absorber du neuf :
   verdict Passer. » (São Félix DOM 76→92 dans `listings_sim.csv` pour matérialiser
   l'anomalie ; sa marge 11% inchangée, hiérarchie résidentielle préservée.)
4. **Séparation du tableau** (`PriceMarginTable`) : par défaut, viables (marge desc)
   au-dessus, filet « Sous le seuil de viabilité », puis Passer (marge desc). Dès que
   l'utilisateur trie une colonne (`userSorted`), la séparation disparaît → tri global.

### Lot #6 — Refonte TVA/foncier résidentiel PT + cohérence Prix & marge — **✅ Livré** (2026-07-02)
1. **Moteur** : plus de déduction TVA du prix de sortie pour le **résidentiel PT**
   (`_promo_marge`, cf. convention fiscale §2). Commercial et Belgique inchangés.
   Ajout d'un override `construction_eur_m2` pour l'actif nommé (Haya).
2. **Recalibrage foncier + prime résidentiel Gaia** (marges cibles inchangées côté
   viables : Santa Marinha 30 %, Madalena 29 %, Canidelo 24 %, Mafamude 19 %,
   couronne 5-7 %, São Félix 11 % anomalie ; rural **-8…+2 %** = à l'équilibre).
   Foncier réaliste : Santa Marinha 524, Madalena 594, Canidelo 673, rural 128-295 ;
   **aucun foncier < 40**, foncier des viables 14-18 % du prix, prime **18-34 %**.
   `gaia_default` porté à foncier 470 / prime 26 → la zone *municipio* (vue ville)
   garde une marge réaliste (~14 %) et l'insight « penche vers la promotion » reste
   stable. Hiérarchie Santa Marinha > Madalena > Canidelo, **3 Go**, garde-fous OK.
   ⚠️ Déviations aux hints doux : Canidelo ~673 et rural 128-295 (forcés par le
   plancher de prime 18 % + marges rurales à l'équilibre).
3. **Haya** : constantes `HAYA` = construction 2065 (NZEB) + foncier 1300 (front de
   fleuve), sans TVA → **35,5 % à 5750** (+111 %). Backend aligné via l'override
   (`assets.haya_towers.construction_eur_m2=2065`, `land_cost_eur_m2=1300`). Texte de
   formule : « marge = (prix de vente − coût) / coût ». Design/curseur intacts.
4. **Cascade** : 1re barre « Prix de vente » (plus « net de TVA ») ; décomposition
   vérifiée exacte (Santa Marinha 30 %, Sandim −8 %).
5. **Cohérence Prix & marge** : `priceMarginInsight` — tête « La promotion <classe>
   tient sur N freguesias, menées par X (30%)… » ; clause finale **calculée** (tous
   non-viables < 0 → « le prix neuf réalisable ne couvre plus le coût de revient » ;
   sinon « marges trop minces ou marchés trop étroits pour absorber le neuf »). KPI
   « Freguesia la plus rentable » → **« Prime neuf médiane »** (viables ; « — » en
   commercial).
6. **Tests** : invariants ajoutés — `test_gaia_residential_land_floor` (foncier ≥ 40),
   `test_haya_margin_35_36`.

### Incident local — API 503 — **✅ Résolu** (2026-07-02)
Symptôme : 503 sur tous les `/api/scoring/*` vus du navigateur, frontend OK.
**Cause** : aucun code ni donnée en cause — dépôt strictement propre (aucun diff vs
HEAD, y compris `backend/data/` et `data/`). Le backend était **simplement mort** :
rien n'écoutait sur le port 8000, aucun process uvicorn résiduel ; le 503 venait du
proxy Next.js face à un upstream absent. Origine du crash : lancement avec le mauvais
interpréteur — `python -m uvicorn` résout vers **anaconda**, qui n'a pas uvicorn
(« No module named uvicorn », sortie immédiate ; reproduit à l'identique). La bonne
commande est **`python3 -m uvicorn backend.main:app --reload --port 8000`** (cf. §2,
avertissement mis à jour — l'ancienne commande du §2 utilisait `python` : c'était le
piège). Vérifié après relance : `/health` 200 (49 zones), scoring city 200 (hiérarchie
Santa Marinha 86,5 > Madalena 83,2 > Canidelo Go), `/prix-marge` conforme à l'écran
(foncier Santa Marinha 524 €/m², marge 30 %, note d'analyse São Félix, séparation
viabilité), `/vue-ensemble` cohérente (« penche vers la promotion », 3 Go, landbank 51).
Nuance d'affichage constatée (comportement HEAD, pas une régression) : la tuile
HayaSlider affiche « 36% » car `margin.toFixed(0)` (HayaSlider.tsx:60) arrondit la
valeur réelle 35,5 % ; prime +111 % et médiane 2 721 €/m² exactes. Composant NE PAS
MODIFIER → laissé tel quel.

### Page **Rendement** (route `/rendement`) — **✅ Livré** (2026-07-02)
Deuxième page de module (mode **détention**, gabarit Prix & marge), question :
« où conserver, où céder, et combien ça rapporte net ».
1. **Backend** : `breakdown` structuré sur le pilier `rendement_net` (`_net_yield_pct`
   retourne un 4-uplet) : `loyer_marche_eur_m2_an`, `yield_brut_pct`,
   `charges_pct_loyer` (**vacance incluse** — ainsi brut × (1 − charges − fisc) = net
   exactement), `fiscalite_pct_loyer`, `yield_net_pct`. Additif, `_clean` inchangé.
2. **Libs** : `RendementBreakdown` (`api.ts`, `Pillar.breakdown` devient une union),
   `lib/rendement.ts` (`rdRows` avec `weakest` = pilier applicable le plus faible,
   `rdSummary` sur viables Conserver+Surveiller avec repli, `pct2`), `detentionCity`
   exposé par `useGaia`.
3. **Factorisation gabarit** (au lieu de dupliquer) : `components/Waterfall.tsx`
   générique (base − déductions = résultat calculé en interne, état perte conservé,
   `WaterfallEmpty`) — `MarginWaterfall` refondu en habillage (rendu identique),
   `YieldWaterfall` nouveau (brut − charges&vacance − fiscalité = net ; la part
   charges prend le résidu d'arrondi pour tomber exactement sur le net publié).
   `MarginBars` paramétré (`metric`/`title`/`metricLabel`/`digits` + légende par
   mode via le ladder de verdicts) — défauts = comportement historique.
4. **Insights** : `detentionInsight(rows, class)` (compte les **Conserver**, cite les
   2-3 meilleures avec yield net, clause finale = pilier faible le plus fréquent du
   reste : « Le reste bute sur des marchés locatifs trop fragiles » — c'est ce que
   disent les piliers, la résilience étant le vrai discriminant) ;
   `marginAnomalyNote` **généralisée en `anomalyNote(mode, scores)`** — promotion :
   marge ≥ 8 % mais Passer (sortie inchangée, São Félix au mot près) ; détention :
   yield net ≥ au plancher des freguesias gardées mais Céder, expliqué par son
   pilier le plus faible (seuil « correct » 4,5 % jamais atteint par une Céder dans
   ces données → règle relative, honnête et non forcée). Logistique : 0 Céder →
   aucune note affichée (conforme « ne pas forcer »). `PROMO_CLASS_FR` renommé
   `CLASS_ADJ_FR` (partagé promotion/détention).
5. **Page** `app/rendement/page.tsx` : chip « Détention · <classe> », `hideMode`,
   ligne de contexte détention par classe, InsightBanner (bloc droit « Yield net
   max · <freguesia> »), 4 KPI (yield net/brut médians, loyer marché médian
   €/m²/an sur viables ; « À céder » N / total), `RendementTable` (séparateur
   « À céder », tri yield net desc par groupe, tri global au clic utilisateur),
   note d'analyse, cascade, barres. Sélection par défaut : meilleure freguesia
   Conserver (sinon meilleur yield), une seule fois au chargement.
   Sidebar : route `/rendement` active. Vue d'ensemble : la carte Détention gagne
   « Explorer → /rendement » (via `MODE_ROUTE` — plus de « Bientôt » mensonger).
6. **Vérifs** : `tsc` OK, 10 tests backend OK, 5 classes contrôlées à l'écran
   (résidentiel 1 Conserver/7 Surveiller/7 Céder, hero Santa Marinha 3,49 % ;
   bureaux dégradé « Aucune freguesia… meilleur yield net 4.2% à Sandim » ;
   hôtellerie note Canidelo 4,0 % = yield de Santa Marinha conservée mais Céder ;
   logistique 0 Céder sans filet ni note ; commerce 7/15). Cohérence croisée
   vue-ensemble : carte Détention inchangée (municipio 3,7 %), mêmes yields par
   freguesia (native = breakdown). Zéro régression Prix & marge (cascade refondue
   pixel-identique, note São Félix au mot près, HayaSlider intact).
   Captures : `shots/rendement_{residentiel,bureaux}.png`
   (script `shots/capture_rendement.js`).

### Recalibrage Détention — piège du yield inversé — **✅ Livré** (2026-07-02)
Problème : les verdicts suivaient le niveau de yield → le rural battait l'urbain.
Cible : un institutionnel détient là où le marché locatif est **profond**, pas là
où le yield facial est haut. **Yields et loyers strictement inchangés** (sous-scores
`rendement_net` identiques avant/après).
1. **Nouveau pilier `profondeur_locative`** (`_det_profondeur`) : 0,50 × demande
   locative (loyer de marché résidentiel `_res_market_rent`, percentile socle
   `demande_locative`) + 0,30 × parc/liquidité (`n_transactions`, socle `liquidite`)
   + 0,20 × rotation (1/DOM, socle `absorption_speed` existant). Poids détention :
   rendement_net 0,30→**0,15**, profondeur **0,30**, résilience 0,25→0,20, énergie
   0,20, fiscalité 0,15→0,10, portage 0,10→0,05. **Seuils de verdict inchangés**
   (65/45).
2. **Connectivité curée — ceinture urbaine/littorale UNIQUEMENT** (params.json
   zones, conf hypothese) : Madalena 74, Canidelo 63, Mafamude 62, Oliveira 61,
   Arcozelo 58, Gulpilhares 57, São Félix 56 (+ Santa Marinha 75 existant). Les
   7 rurales restent au défaut pays (55). ⚠️ Piège évité : une 1re version curait
   les rurales *sous* le défaut (36-48) → le socle connectivité glissait → landbank
   municipio 45→47,5 (badge « En attente »→« À phaser » sur /vue-ensemble) **et**
   détention logistique municipio (54,7) dépassait la promotion (52,8) = bascule de
   mode dominant. En ne curant qu'au-dessus du défaut, le socle sous 55 ne bouge
   pas : landbank municipio **44,7 « En attente »** (affiché 45, identique),
   dominants intacts (logistique : promotion 52,8 > détention 51,8 — serré).
3. **État cible résidentiel atteint exactement** : Conserver = Santa Marinha 70,0 +
   Madalena 66,4 ; Surveiller = Canidelo 59,6, Mafamude 57,7, Oliveira 55,1,
   Arcozelo 52,3, Gulpilhares 49,6, São Félix 47,5 ; **Céder = les 7 rurales
   37,1-39,2 malgré leurs yields 4,05-4,38 %** (vs 3,22-3,49 % côté Conserver).
   Marges aux seuils : 6,8 pts (Conserver) et 8,3 pts (Céder). Madalena vs Canidelo
   se joue sur connectivité 74 vs 63 (rn quasi à égalité).
4. **Split charges/fiscalité par freguesia** (`_split_jitter_pct`, md5 du zone_id,
   ±1,5 pt du loyer) : l'IMI effectif et les charges de copro varient localement,
   leur **somme** est fixe → brut et net strictement inchangés, colonnes non
   monotones (fini le 20,6→24,8 % linéaire), identité brut × (1 − charges − fisc)
   = net exacte (écart max 0,013 = arrondi d'affichage, testé < 0,02).
5. **Frontend** : bloc droit du bandeau → « **Meilleure détention · <freguesia>** »
   (yield net du Conserver au meilleur score ; repli top viable ; plus jamais un
   max global contredisant la phrase). `detentionInsight` : **clause piège du
   yield** — si la freguesia au yield net max n'est pas Conserver : « Les yields
   les plus élevés (<freguesia> <val>%) sont des pièges de fragilité : marchés
   étroits, vacance longue. » (remplace la clause générique ; en logistique le
   yield max est Santa Marinha elle-même → clause générique conservée, c'est
   exact). `profondeur_locative` ajouté à DET_CLAUSE + PILLAR_REASON.
6. **Bascules assumées (5 classes, structure 2 Conserver / 6 Surveiller / 7 Céder
   partout** — profondeur et résilience sont class-indépendantes, seul le niveau
   rn varie) : municipio **Céder→Surveiller** (~49-52) → carte Détention de
   /vue-ensemble à **50 Surveiller** (avant 44 Céder) ; bureaux 0→2 Conserver (le
   cas dégradé disparaît) ; hôtellerie 1→7 Céder ; logistique 0→7 Céder ;
   Madalena 73,9 / Canidelo 67,3 en landbank → « Prioritaire » (visible sur la
   Carte seulement). Lisbonne : Parque das Nações détention 69,6 Conserver
   (cohérent profondeur) ; Bruxelles ixelles/uccle ~42-44 Céder.
7. **Vérifs** : note d'anomalie cite naturellement **Sandim 4,4 % … verdict Céder**
   (résidentiel ; bureaux 4,2 %, hôtel 5,1 %) ; tri par défaut = 8 tenues au-dessus
   du filet « À céder », 7 rurales dessous ; KPI viables recalculés (résidentiel :
   net 3,7 %, brut 5,3 %, loyer 129 €/m²/an) ; `tsc` OK ; **13 tests** backend OK
   dont 3 nouveaux (`test_detention_residential_recalibrated_groups`,
   `test_detention_no_rural_conserver_residential` = invariant demandé,
   `test_detention_breakdown_identity`) ; zéro régression /prix-marge (7 freguesias
   30/29/24, KPIs identiques) et /vue-ensemble (seule la carte Détention change,
   voulu) ; HayaSlider intact ; `_clean` inchangé. Captures régénérées :
   `shots/rendement_{residentiel,bureaux}.png`.

### Page **Arbitrage** (route `/arbitrage`) + micro-fix tri Rendement — **✅ Livré** (2026-07-02)
Troisième page de mode (« où la fenêtre de cession est ouverte, à quel prix, en
combien de temps »), gabarit Prix & marge / Rendement.
0. **Micro-fix /rendement** : tri par défaut du tableau = **score décroissant par
   groupe** (Conserver puis Surveiller au-dessus du filet, Céder dessous) — Santa
   Marinha (70) et Madalena (66) ouvrent le tableau. Tant que l'utilisateur n'a pas
   trié, **aucune flèche de colonne n'est active** (aucune colonne ne porte l'ordre) ;
   le tri utilisateur reste global et sans filet. Même règle appliquée au nouveau
   tableau Arbitrage.
1. **Backend** : `breakdown` sur le pilier `spread` (`_arb_breakdown`) —
   `prix_marche_eur_m2` (référence de la mesure du spread), `valeur_realisable_
   eur_m2` (= marché × (1+spread), cohérent sur les 4 chemins de calcul du spread :
   actif KREST / comparable / quantiles / positionnement vs médiane ville — Gaia
   passe par le positionnement, d'où un prix marché constant par classe),
   `spread_pct`, `delai_cession_mois` (DOM × facteur de liquidité, **borné 2-9
   mois** ; Gaia 3,0-8,1 — Santa Marinha la plus rapide, São Félix la plus lente),
   `frais_cession_pct` (**2-4 %**, liquidité + jitter zone réutilisé),
   `decote_negociation_pct` (0,8 × délai, borné 1,5-6 — ajouté pour la cascade).
   Additif, `_clean` inchangé. Test `test_arbitrage_breakdown_bounds` (bornes +
   réconciliation réalisable/marché/spread).
2. **Page** : chip « Arbitrage · <classe> », contexte par classe, KPI viables
   (spread médian, délai médian, **appétit dominant qualitatif**, fenêtres
   ouvertes N / 15), `ArbitrageTable` (prix marché, valeur réalisable, spread
   signé coloré, délai, appétit, verdict ; filet « Fenêtre fermée »),
   `SpreadWaterfall` via le Waterfall générique (valeur réalisable − frais −
   décote = produit net, spread en synthèse), barres spread par verdict
   (MarginBars paramétré), sélection par défaut = meilleure fenêtre.
3. **Insights** : `arbitrageInsight` gradué (0/1/2/≥3 ouvertes) ; **clause
   signature** symétrique au piège du yield — si la freguesia au spread max n'est
   pas Fenêtre ouverte : « Les spreads les plus larges (<freguesia> <val>) sont
   théoriques : sans acheteur institutionnel, la fenêtre reste fermée. » Rendu
   résidentiel : dégradé + piège Canidelo +40 % (0 ouverte) ; bureaux : « Une
   seule fenêtre… Santa Marinha (+33%) » + clause générique (le spread max EST
   l'ouverte — pas de piège, exact). Bloc droit « **Meilleure fenêtre ·
   <freguesia>** » (top-score ouverte, repli top viable). `anomalyNote` branche
   arbitrage (spread ≥ 10 % mais Fenêtre fermée) : **aucune freguesia ne qualifie
   sur les données actuelles** (max fermée = Arcozelo +1,6 %) → rien d'affiché
   dans les 5 classes, donnée non forcée (assumé).
4. **Routes** : Sidebar `/arbitrage` + carte Arbitrage de /vue-ensemble reliée via
   `MODE_ROUTE` (plus de « Bientôt » ; seul Landbank en garde un).
5. **Vérifs** : `tsc` OK, **14 tests** backend OK, 5 classes contrôlées (résidentiel
   0/7 étroites/8 fermées ; bureaux 1 ouverte ; appétits soutenu/modéré par classe),
   cohérence carte Arbitrage municipio (52 Fenêtre étroite, spread 10 %, inchangée),
   zéro régression /prix-marge, /rendement (hors micro-fix voulu), /vue-ensemble.
   HayaSlider intact, `_clean` inchangé. Captures :
   `shots/arbitrage_{residentiel,bureaux}.png` (script `shots/capture_arbitrage.js`).

### Prochaine page de mode (gabarit = Prix & marge / Rendement / Arbitrage)
Foncier (landbank, constructibilité). Réutiliser la structure : KPIs → tableau
triable (tri par défaut : score desc par groupe de verdict, flèches inactives
avant tri utilisateur) → décomposition/piliers → graphe. **Briques génériques
prêtes** : `InsightBanner`, `Waterfall`, `MarginBars` paramétré, `anomalyNote(mode)`
(ajouter la règle de qualification landbank + `PILLAR_REASON` de ses piliers),
gabarit d'insight de page à décliner (constructibilité / meilleur usage). Exposer si
besoin un `breakdown` structuré sur le pilier natif (déjà fait : `marge`,
`rendement_net`, `spread`) et brancher `MODE_ROUTE.landbank`.
