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

### Prochaines pages de mode (gabarit = Prix & marge)
Rendement (détention), Arbitrage, Foncier (landbank). Réutiliser la structure :
KPIs → tableau triable → décomposition/piliers → graphe. **Briques d'insight prêtes**
(`lib/insights.ts` + `components/InsightBanner.tsx`) : `cityInsight`/`modeInsight`
(synthèse), `priceMarginInsight`/`marginAnomalyNote` (gabarit à décliner par mode :
rendement, spread, constructibilité), et le bandeau `InsightBanner` partagé. Chaque
page épingle son mode ; exposer si besoin un `breakdown` structuré sur le pilier natif.
