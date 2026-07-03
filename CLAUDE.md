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

### À remplacer par les données client (avant mise en prod)
- **Actifs K-REST vedettes fictifs** : `Ribeira Sul` (détention — immeuble de
  rapport Santa Marinha, 24 lots / 1 800 m², acquis 2 300 €/m² + 340 €/m² de
  travaux, constantes `RIBEIRA` dans `lib/scoring.ts`), `Cais Poente`
  (arbitrage — trophée front de fleuve Santa Marinha, constantes `CAIS`) et
  `Monte Claro` (landbank — réserve foncière ~12 000 m² à Canidelo, constantes
  `MONTE` ; **localisation, surface et statut urbanistique réels à fournir par
  KREST**). Noms vérifiés sans correspondance avec un projet réel de Gaia
  (2026-07) ; à remplacer par les vrais actifs du portefeuille KREST. Haya
  Towers vient du brief client (params `assets`).
- **Marge promoteur normative de la valeur résiduelle foncière** : 15 % est
  notre hypothèse (`_LAND_NORMATIVE_MARGIN`) — à remplacer par la marge
  normative interne de KREST.
- **Appétit institutionnel par classe** (`institutional_appetite`, params.json) :
  valeurs de calibration — à remplacer par la lecture marché de KREST.
- **Frais et délais de cession** : aujourd'hui dérivés (frais 2-4 % et délais
  2-9 mois pilotés par la liquidité/DOM, décote 0,8 × délai) — à remplacer par
  les frais et délais réels constatés par KREST sur ses cessions.
- **Parc énergétique par freguesia** (`PARC_SCE` dans `lib/energie.ts` +
  décalage par classe) : répartition SCE simulée réaliste (gradient âge du
  bâti) — à remplacer par les certificats énergétiques réels des actifs KREST
  et les données ADENE/INE du parc.

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
  (module Prix & marge), `RendementTable` + `YieldWaterfall` + `RibeiraSlider`
  (module Rendement), `ArbitrageTable` + `SpreadWaterfall` + `CaisSlider`
  (module Arbitrage), `FoncierTable` + `MonteClaroSelector` (module Foncier),
  **briques génériques de page de mode** : `Waterfall` (cascade base − déductions =
  résultat, état perte inclus ; `MarginWaterfall`/`YieldWaterfall` n'en sont que des
  habillages) et `MarginBars` (barres par verdict, paramétré `metric`/`title`/
  `metricLabel`/`digits`, légende par mode), `ui.tsx` (`VerdictBadge`, `ScoreDial`
  avec prop `light` pour fond clair, `PillarBar`, `Segmented`, `MultiSelect`).
  `KeyFigures`, `ScoreCards`, `CityCharts`, `CityBits` existent encore mais ne sont
  plus utilisés par la Vue d'ensemble refondue (réutilisables).
- **Pages** : `app/gaia` (Carte), `app/vue-ensemble` (Vue d'ensemble, sans carte),
  `app/comparer` (Comparer, transverse), `app/prix-marge` (Prix & marge),
  `app/rendement` (Rendement), `app/arbitrage` (Arbitrage), `app/foncier`
  (Foncier), `app/fiscalite` (Fiscalité), `app/energie` (Énergie),
  `app/ia-analyste` (IA Analyste) — **la Sidebar est complète, démo terminée**.
- **Libs** : `lib/api.ts` (client + types), `lib/scoring.ts` (couleurs, verdicts,
  médiane, config KPI par mode, formule Haya), `lib/normalize.ts` (clé de jointure
  GeoJSON ↔ zone_name), `lib/priceMargin.ts` (lignes Prix & marge), `lib/rendement.ts`
  (lignes Rendement), `lib/arbitrage.ts` (lignes Arbitrage), `lib/foncier.ts`
  (lignes Foncier), `lib/insights.ts` (générateur d'insights déterministe — voir §5).

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
| Commerce     | -26,6 %| 22,1 % | -0,3 %  | **recalibré niveaux absolus (lot QA commerce)** |

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

### Nettoyage tableau Arbitrage + actifs K-REST vedettes — **✅ Livré** (2026-07-02)
0. **Tableau /arbitrage** : colonnes « Prix marché » (médiane ville, constante par
   classe) et « Appétit » (constant par classe, déjà en KPI) supprimées → Freguesia,
   Valeur réalisable, **Spread (vs médiane Gaia)**, Délai, Verdict. La médiane
   chiffrée reste dans le sous-titre de la cascade (« Médiane Gaia 2 249 €/m² »).
1. **Deux actifs vedettes** sur le modèle exact du bloc Haya (carte navy « ACTIF
   K-REST · <MODE> », curseur, recalcul live, 3 tuiles, même emplacement : grille
   à côté de la décomposition, visibles pour Santa Marinha / résidentiel — la
   sélection par défaut des deux pages). **Fictifs, noms vérifiés par recherche
   web sans correspondance à un projet réel de Gaia** (éviter « Cavaco » /
   « Afurada » : Cais do Cavaco et Cais D'Afurada existent). Aucun changement
   backend (mécanisme score_asset non nécessaire) : les curseurs lisent les
   données de la freguesia en direct (taux, loyer marché, médiane, réalisable,
   rotation, score, poids du pilier) — alignement par construction.
   - **Ribeira Sul** (`RibeiraSlider`, détention) : immeuble de rapport, 24 lots,
     1 800 m². ⚠️ Réconciliation : « valeur ~2 300 » + défaut 11,5 €/m²/mois +
     taux freguesia donnaient net 4,1 % (hors invariant 3,3-3,8) → montage
     **acquis 2 300 €/m² + 340 €/m² de travaux = base all-in 2 640 €/m²**, qui
     honore les deux (brut 5,23 %, net 3,59 % au défaut, loyer 138 ≈ marché 139).
     Curseur loyer 8-16 ; identité net = brut × (1 − charges − fiscalité) avec
     les taux **jittérés** de la freguesia (lus du breakdown). Tuiles : yield
     net, loyer vs marché, score (ancré sur le score zone via `yieldNetSubscore`).
   - **Cais Poente** (`CaisSlider`, arbitrage) : trophée front de fleuve. Curseur
     prix visé 2 100-3 400 (défaut 2 520 → spread +12 % ∈ [8-15]) ; délai =
     rotation zone × (prix / valeur réalisable)^4 borné 2-9 (demander plus cher
     rallonge la fenêtre) ; score ancré zone via `spreadSubscore`.
2. **scoring.ts** : `bandSubscore` générique (margeSubscore inchangé au chiffre
   près), `yieldNetSubscore` / `spreadSubscore` (miroirs des bandes params),
   `detentionVerdict` / `arbitrageVerdict` (échelles 65/45), constantes `RIBEIRA`
   / `CAIS`. HayaSlider **strictement intact**.
3. **Test** `test_krest_featured_asset_defaults` : au défaut des curseurs, net
   Ribeira ∈ [3,3-3,8] % et spread Cais ∈ [8-15] % — calculés contre l'économie
   vivante de la freguesia (le test casse si une recalibration décale les taux).
4. **Section « À remplacer par les données client »** créée en §1 (actifs fictifs,
   appétit par classe, frais/délais de cession réels).
5. **Vérifs** : `tsc` OK, **15 tests** backend OK, sliders absents hors
   résidentiel / hors Santa Marinha, zéro régression /prix-marge /vue-ensemble
   (captures re-contrôlées), captures des 4 pages régénérées.

### Page **Foncier** (route `/foncier`) — **✅ Livré** (2026-07-02) — les 4 modes ont leur page
Dernière page de mode (landbank : « quelle réserve activer, pour quel usage, à
quel horizon »), gabarit établi.
1. **Backend** : `breakdown` sur le pilier `constructibilite` du landbank —
   `constructibilite`, `meilleur_usage` (**argmax uplift** sur les 5 usages, prix
   réels par classe — l'ancien `_best_use_value` à facteurs reste sur le pilier
   `valeur_meilleur_usage`, carte Vue d'ensemble inchangée), `prix_realisable_
   meilleur_usage_eur_m2`, `foncier_marche_eur_m2` (**celui de la promotion** du
   meilleur usage : table zone en résidentiel, % du prix en commercial),
   `valeur_residuelle_eur_m2` = prix réalisable / (1,15 × pile de coûts 1,261) −
   construction (marge promoteur normative **15 %** = `_LAND_NORMATIVE_MARGIN`),
   `uplift_pct` **borné [−40, +80] %** avec résiduel réconcilié = foncier ×
   (1 + uplift) (jamais négatif), `usages` (table des 5 usages pour le bloc
   interactif), `horizon_activation` (immédiat si Prioritaire et rotation ≤ 3
   mois / 2-4 ans / au-delà — injecté dans `score_mode` car dépend du verdict).
   Additif, `_clean` inchangé. Narrative émergente : cœur urbain → résidentiel
   (+28 à +55 %), couronne → commerce (≈ 0 %), rural → logistique (−5 à 0 %) ;
   les uplifts de tête tombent naturellement dans les bornes (aucun clamp
   visible). Test `test_landbank_breakdown_invariants`.
2. **Page** : contexte unique (le landbank est **class-indépendant** — aucun
   pilier ne dépend de la classe, contenu stable sur les 5 classes, assumé),
   InsightBanner `landbankInsight` gradué (résidentiel : « L'activation foncière
   est prioritaire sur 3 freguesias, menées par Santa Marinha (+55%), Madalena
   (+47%) et Canidelo (+28%). Le reste bute sur des valeurs de sortie trop
   basses pour couvrir le foncier. »), bloc droit « Meilleur potentiel ·
   Madalena +47% » (top-score Prioritaire). **Clause signature** (« Constructible
   ne veut pas dire activable… ») implémentée mais **ne fire pas sur les données
   actuelles** : la constructibilité max (Santa Marinha 71) est Prioritaire —
   clause générique à la place, non forcé. KPI viables (uplift médian +16 %,
   constructibilité 64, usage dominant Résidentiel, Prioritaires 3/15),
   `FoncierTable` (7 colonnes + verdict, filet « En attente », tri score desc
   par groupe, accent « À phaser » ajouté à `verdictLabel`), note d'anomalie
   **naturelle** (« Vilar de Andorinho affiche une constructibilité de 51 mais
   une desserte insuffisante pour porter un programme : verdict En attente. »),
   barres uplift par verdict.
3. **Monte Claro** (`MonteClaroSelector`, actif K-REST · Landbank) : réserve
   foncière fictive ~12 000 m² à Canidelo (nom vérifié sans homonyme réel —
   projets réels : Le Parc, Canidelo Houses…). **Sélecteur des 5 usages** (pas de
   curseur) qui recalcule valeur résiduelle / uplift / verdict depuis la table
   `usages` réelle de Canidelo, badge « optimal » sur l'argmax (résidentiel
   +28 %) ; score ancré zone via `upliftSubscore` (bande front-side, calibration
   widget). Habillage navy identique aux autres blocs K-REST.
4. **Routes** : Sidebar `/foncier` + `MODE_ROUTE.landbank` — **plus aucun
   « Bientôt » sur la Vue d'ensemble** (les 4 cartes de mode sont reliées).
5. **Vérifs** : `tsc` OK, **16 tests** backend OK, carte Landbank municipio
   inchangée (45 En attente, « meilleur usage hôtel à 3 018 €/m² » — legacy
   assumé), zéro régression sur les 4 autres pages, HayaSlider et blocs K-REST
   intacts. Captures : `shots/foncier_{residentiel,bureaux}.png`
   (script `shots/capture_foncier.js`).

### QA Foncier + recalibrage niveaux absolus commerce — **✅ Livré** (2026-07-02)
1. **Bloc droit /foncier** : « Meilleur potentiel » = l'**uplift max des
   Prioritaires** (Santa Marinha +55 %), plus le top-score (Madalena) ; repli
   uplift max des viables si aucun Prioritaire.
2. **Tie-break de tri** (Rendement / Arbitrage / Foncier) : les scores affichés
   étant arrondis, égalité de score arrondi → métrique native décroissante
   (Santa Marinha 74 / +55,4 passe devant Madalena 74 / +47,1). Prix & marge
   n'est pas concerné (son tri par défaut est la marge, pas le score).
3. **Recalibrage commerce** (`commercial_gaia.retail` : loyer 30→**15 €/m²/mois**,
   construction 1 400→**1 200** (coque), land_pct 48→**30 %** ; facteurs retail
   resserrés : SM 1,05, Madalena 1,0, couronne 0,74-0,88, rural 0,47-0,54,
   municipio 0,86). Résultat : **prime 3 436/3 273 €/m², marges 22,1/19,0 %,
   fonciers 1 031/982** (cibles ✓) ; couronne 2 422-2 880, fonciers 727-864 ;
   rural 1 538-1 767 (< 1 800 ✓), fonciers 461-530, marges −19 à −27 (le rural
   commerce meurt, « non pertinent » assumé).
   **Écarts signalés (non forcés)** : (a) marges couronne **3,0-10,7 %** — la
   cible « 15-25 % partout » est mathématiquement incompatible avec le modèle de
   coûts (construction fixe + foncier en % du prix : la marge croît avec le
   niveau de prix ; pour tenir prime ≤ 25 % il faut couronne ≈ 3-11 %) ;
   (b) fonciers couronne 727-864 au-dessus des 250-600 attendus (c'est le rural
   qui tombe dans cette fourchette) — foncier ≤ 600 en couronne à 2 500-2 900
   €/m² de prix donnerait des marges > 30 %.
4. **Carte des usages landbank** : cœur urbain résidentiel ✓, **Oliveira garde
   le commerce** (−9,0 vs bureaux −10,7 — facteur retail Oliveira 0,88, niveau
   Canidelo, sinon bureaux gagnait avec un foncier 1 321 > borne 1 200) ;
   **Gulpilhares → hôtel** (−9,7, Valadares balnéaire, foncier 924),
   **Arcozelo/São Félix → logistique** — le commerce perd une partie de la
   couronne au profit de l'hôtel/logistique (pas du résidentiel), chiffres :
   commerce y tombe à −27/−35 d'uplift. Bornes : **aucun foncier de meilleur
   usage > 1 200 hors prime** (`test_landbank_best_use_land_cap`).
5. **Effets contrôlés** : /prix-marge commerce 2 Go / 4 Conditionnel / 9 Passer
   (insight « tient sur 6 freguesias, menées par SM (22%), Madalena (19%) et
   Canidelo (11%) »), aucune colonne aberrante, cascade exacte ; détention
   commerce 2/6/7 inchangé ; arbitrage commerce 7 étroites/8 fermées (structure
   identique, spreads recalculés : SM +42 %) ; loyers commerce ~120-165 €/m²/an
   (défendables). **Vue d'ensemble commerce : promotion municipio 62,7→53,3**,
   égalité parfaite avec l'arbitrage (53,3) — la promotion garde la dominance
   (ordre des modes dans `bestMode`), le bandeau passe de « est un marché de
   commerce » à « **penche vers la promotion en commerce : 2 freguesias Go,
   marges de 19 à 22%** » (le commerce surchauffait à cause des prix gonflés —
   changement assumé). Monte Claro : optimal résidentiel +27,7 intact, commerce
   +3→−9. Tests : **18/18** dont `test_gaia_retail_levels`.

### Page **Comparer** (route `/comparer`) — **✅ Livré** (2026-07-02) — couche de décision
Page **transverse** (pas une page de mode) : 2-3 freguesias côte à côte à travers
les 4 modes. **Aucun nouveau calcul métier** : recomposition de `citiesByMode`
(les 4 modes de la classe courante, déjà préchargés par `useGaia`), mêmes valeurs
que les pages de mode (marge / yield net / spread / uplift + résiduelle landbank
lus des mêmes piliers/breakdowns). Aucune carte Leaflet.
1. **Structure** : Header `hideMode` + classe active ; 3 sélecteurs en tête
   (Santa Marinha et Madalena préremplis, 3ᵉ « + Ajouter une freguesia » en
   pointillé or, option « — Retirer — », doublons filtrés) ; une colonne par
   freguesia : identité (prix médian, yoy, transactions/an), 4 modes empilés
   (`ScoreDial light`, badge `verdictLabel`, métrique native, lien « Voir en
   détail → » vers `MODE_ROUTE[mode]`), ligne « Signal dominant ».
2. **Insights** (`insights.ts`) : `compareInsight(cells)` — « Profil promotion :
   marge 30%, le foncier et la détention suivent. » (meilleur mode + 2 suivants
   en prose) ; `compareSynthesis(cols)` — gagnant par mode (au score), phrase
   « qui gagne sur quoi » avec le chiffre sur le mode de tête de chaque gagnant,
   le landbank comparé en **valeur résiduelle €/m²** : « Santa Marinha domine en
   promotion (30% vs 29%), en détention et en arbitrage ; Madalena prend
   l'avantage en valeur résiduelle foncière (874 vs 814 €/m²). » Bloc droit
   « Avantage · <freguesia> N / 4 modes en tête ».
3. **`MODE_ROUTE` déplacé dans `lib/scoring.ts`** (partagé Vue d'ensemble /
   Comparer) — vue-ensemble vérifiée inchangée au pixel.
4. **Vérifs** : `tsc` OK, 18 tests backend inchangés, contrôles écran 2 puis 3
   freguesias × résidentiel/bureaux (bureaux : les signaux dominants divergent —
   Madalena/Canidelo « Profil landbank », SM arbitrage Fenêtre ouverte +33 % —
   mêmes valeurs que les pages de mode), zéro régression sur les 6 pages.
   Capture : `shots/comparer_residentiel.png` (script `shots/capture_comparer.js`).

### Retouches Comparer + page **Fiscalité** (route `/fiscalite`) — **✅ Livré** (2026-07-02)
0. **Comparer** : `compareSynthesis` compare désormais le gagnant au **meilleur
   des autres colonnes sur la valeur comparée** (métrique native ; résiduelle
   pour le landbank), plus la 2ᵉ au score — bureaux 3 colonnes : « domine en
   promotion (20% vs 15%) » (Canidelo) et « 874 vs 859 €/m² » (Canidelo) ✓.
   Tuile Transactions : sous-libellé « tous segments » (marché global, le prix
   médian est par classe). **Prix & marge commercial** : le KPI « Prime neuf
   médiane — » devient « **Foncier médian** » des viables (`pmSummary.medianLand`).
1. **Page Fiscalité** (transverse de contexte, PT/Gaia) : « ce que le fisc prend
   à chaque étape, et comment c'est déjà intégré dans nos verdicts ».
   - **`lib/fiscal.ts`** : barème IMT 2026 **habitação secundária** (continent),
     limites officielles (tables AT 06-01-2026, +2 % vs 2025 : 106 346 / 145 470 /
     198 347 / 330 539 / 660 982 / 1 150 853 €), parcelas a abater reconstituées
     par continuité exacte du barème (1 063,46 / 5 427,57 / 9 394,52 / 12 699,91),
     taux uniques 6 % et 7,5 % ; commercial & terrains à bâtir 6,5 % ; selo 0,8 % ;
     IMI 0,30-0,45 % ; AIMI société 0,4 % ; **IRC 2026 = 19 %** (OE 2026) +
     derramas → effectif ~21 % (= l'`exit_cgt` du moteur, « IRC + derramas » —
     cohérence moteur/officiel vérifiée, aucune dérive).
   - **3 volets** Acquérir / Détenir / Céder avec les taux ci-dessus, chacun
     terminé par « Dans la plateforme : intégré à … » → lien vers la cascade
     concernée (/prix-marge, /rendement, /arbitrage).
   - **`fiscalInsight(cls, pmRows, rdRows)`** : résidentiel « ~4 % du prix de
     sortie » (médiane viables : 7,3 % du foncier à l'entrée + 21 % de la marge
     à la sortie) ; commercial « ~22 % du loyer annuel (IMI puis IRC), après
     ~7,3 % à l'entrée ». Bloc droit « Frais d'entrée max » 8,3 % / 7,3 % selon
     la classe.
   - **Simulateur d'acquisition** (`AcquisitionSimulator`, navy, libellé neutre
     « SIMULATEUR D'ACQUISITION · PORTUGAL ») : curseur 200 k-5 M€, IMT marginal
     résidentiel / 6,5 % commercial + selo, total € et %. **Points de contrôle
     rendus des mêmes formules** (vérifiés) : 400 k → 19 300 + 3 200 = 22 500
     (5,6 %) ; 1,5 M → 112 500 + 12 000 = 124 500 (8,3 %) ; 4 M → 332 000
     (8,3 %) ; 1 M (défaut) → 68 000 (6,8 %). Source discrète en pied de page
     (« Barèmes officiels PT 2026 »).
   - Route Sidebar `/fiscalite`, aucune carte Leaflet, aucun paramètre brut du
     moteur exposé (les taux affichés sont les barèmes publics).
2. **Vérifs** : `tsc` OK, 18 tests backend inchangés, 2 classes contrôlées à
   l'écran + simulateur aux 3 valeurs, zéro régression sur les 7 pages.
   Capture : `shots/fiscalite.png` (script `shots/capture_fiscalite.js`).

### Retouches Fiscalité + page **Énergie** (route `/energie`) — **✅ Livré** (2026-07-02) — Sidebar complète
0. **Fiscalité** : sous-libellé IMT corrigé (« taux uniques 6% (660 982 –
   1 150 853 €) et 7,5% au-delà » — le 7,5 % ne démarre pas à 660 982) ;
   nouvelle ligne Acquérir « **Non-résidents — résidentiel (dès 01/09/2026) :
   7,5 %** » vérifiée par recherche web : **DL 97/2026 du 20 mai**, taux fixe,
   remboursable si résidence fiscale sous 2 ans OU location à loyer modéré
   (≤ 2 300 €/mois, contrat sous 6 mois, tenu ≥ 36 mois sur 5 ans). Source du
   pied de page complétée.
1. **Page Énergie** (transverse) : « ce que la réglementation énergétique va
   coûter au parc, où, et comment c'est déjà compté dans nos verdicts ».
   ⚠️ **Adaptation d'exactitude signalée** : l'échelle SCE portugaise est
   **A+ → F (8 classes, pas de G** — DL 101-D/2020) ; les seaux demandés
   « F-G » deviennent **E-F**, le simulateur « G→D » devient **F/E/D → D/C/B**,
   les trajets de contrôle « G→C, E→C » deviennent **F→C et E→C**. La note
   moteur « MEPS F/G » est un raccourci UE (inchangée, interne).
   - **Faits vérifiés** (frise) : EPBD (UE) 2024/1275 en vigueur 28/05/2024 ;
     transposition 29/05/2026 ; ZEB public 2028 / tout le neuf 2030 ;
     non-résidentiel : pires **16 % rénovés d'ici 2030, 26 % d'ici 2033** ;
     résidentiel : énergie primaire moyenne **−16 % (2030), −20/22 % (2035)**
     dont ≥ 55 % via les 43 % les plus énergivores ; chaudières fossiles 2040.
     Ligne « Dans la plateforme : pilier énergie de la cascade Rendement → ».
   - **Parc simulé** (`PARC_SCE`, gradient âge du bâti : Santa Marinha centre
     historique 38 % E-F → Canidelo neuf littoral 14 % ; décalage par classe
     ×0,7-1,0) ; **risque MEPS dérivé du pilier moteur** (natif 35 modulé par
     l'exposition → 24-35) ; verdict énergie qualitatif Exposé / À surveiller /
     Contenu. Tableau trié par exposition.
   - **`energieInsight`** par classe : résidentiel « ~24 % du parc sous la
     classe D… » ; commercial « ~20 % en classes E-F : les seuils MEPS imposent
     la rénovation des 16 % les moins performants d'ici 2030 (26 % en 2033)… ».
     Bloc droit « Parc le plus exposé · Santa Marinha 38 % » (32 % en bureaux).
   - **`RetrofitSimulator`** (navy, neutre) : classes actuelle F/E/D → cible
     D/C/B, CAPEX €/m² par saut (F→E 70, E→D 80, D→C 120, C→B 180 — ordres de
     grandeur ADENE/marché : ETICS 30-80 €/m² façade, toiture 20-60, PAC
     6-7,5 k€, menuiseries ~2 k€/logement), impact sur l'actif type Santa
     Marinha lu de la ligne détention (valeur = loyer/brut = 2 725 €/m², CAPEX
     ajouté à la base, loyer inchangé) : **F→C ~270 €/m² → −0,31 pt ;
     E→C ~200 €/m² → −0,23 pt** (contrôlés à l'écran).
   - Sources discrètes en pied de page ; parc simulé ajouté à la liste
     « à remplacer par les données client ». Route Sidebar `/energie`.
2. **Vérifs** : `tsc` OK, 18 tests backend inchangés, 2 classes contrôlées,
   zéro régression sur les 8 pages. Capture : `shots/energie.png`
   (script `shots/capture_energie.js`).

### **IA Analyste** (route `/ia-analyste`) — **✅ Livré** (2026-07-02) — dernière brique
**Architecture du contexte (garde-fous de sécurité)** :
- Endpoint `POST /api/analyst/ask {question, asset_class}`
  (`backend/routers/analyst.py`). Le contexte est construit **exclusivement**
  à partir des payloads passés par le **même `_clean()`** que les endpoints
  publics (`score_city` × 4 modes, ville + 15 freguesias : scores, verdicts,
  breakdowns compactés en lignes texte) + les **faits statiques déjà publiés**
  par les pages Fiscalité/Énergie (barèmes officiels, échéances EPBD, parc SCE
  par freguesia, coûts de mise à niveau). Jamais params.json, jamais confiance/
  source, jamais la notion de simulation. Contexte mis en cache par classe
  (`lru_cache`).
- Appel Anthropic (SDK python, **mis à jour 0.29 → 0.116** : le 0.29 crashait
  en TypeError avec httpx récent), modèle `claude-sonnet-4-6`, max_tokens 800.
  Clé lue de `backend/.env` (`ANTHROPIC_API_KEY=`) — **fichier reformaté**
  (était `API_KEY : …`, format invalide) **et ajouté au .gitignore** (il n'y
  était PAS : seuls `.env.local`/`.env*.local` étaient couverts — repo public,
  un `git add -A` l'aurait exposé). Vérifié non tracké avant commit.
- **System prompt** : persona analyste Barzel, français, données fournies
  uniquement, chiffres exacts, jamais confiance/source/simulation (« la
  plateforme agrège des données de marché et son modèle propriétaire Barzel »),
  hors périmètre → « hors du périmètre couvert par la plateforme sur Gaia »,
  5-10 lignes texte simple sans markdown, verdict actionnable. Ajouts après
  tests : « 15 freguesias, jamais “friches”/“quartiers” » (le modèle avait dit
  « friches » et « seize freguesias »), « pas de markdown » (1ʳᵉ réponse en ##/**). 
- Erreurs : 503 sobre « analyste momentanément indisponible » (type d'exception
  loggé côté serveur uniquement).
**Frontend** : `app/ia-analyste/page.tsx` — conversation sobre (bulle user navy,
réponses « Analyste Barzel » au filet or, `whitespace-pre-line`), 5 questions
suggérées en chips, classe active alimentant `asset_class`, chargement 3 points
animés, erreur en note discrète. Sidebar : lien actif, **badge BIENTÔT retiré**.
`api.analystAsk()` dans `lib/api.ts`.
**Tests de réponse (7 questions)** : les 5 suggérées citent des chiffres
**strictement identiques aux pages** (86,5/30,0 %/3 646/primes 34-31-18/fonciers
524-594-673 ; Madalena 66,4/5,00/24,7/7,3/3,40/143 ; Canidelo 859/673/+27,7 %/
constructibilité 69 ; énergie 38 %/2 725/270/−0,31 pt/3,49→3,18 ; bureaux
79,3-70,1/19,8-12,1 %/4 663-4 080/3,09-3,34/33,3 %/55,4-47,1) ; les 2 pièges se
comportent : « quelles données sont simulées ? » → formule modèle propriétaire
sans rien révéler ; « prix à Lisbonne ? » → hors périmètre, élégant. Réponses
intégrales conservées dans le rapport de livraison.
**Micro-fix** : bandeau /energie « déjà pénalisé » (accord).

### QA Carte — prix ville unique + panneau détention — **✅ Livré** (2026-07-02)
1. **Une seule définition du prix médian ville** : la zone **municipio servie
   par le moteur** (pondérée transactions : 2 474 €/m², +16,3 %, 5 494 tx en
   résidentiel) — la Carte la lisait déjà (`quickFor`) ; la ligne « Contexte
   marché » de la Vue d'ensemble calculait sa propre médiane de freguesias
   (2 249, +16,8) → elle lit désormais le municipio (`overview.scores`).
   Vérifié : aucune autre page n'affiche de troisième valeur (`figures` de
   useGaia n'est plus rendu nulle part ; les médianes des pages de mode sont
   des KPI de viables, pas un « prix de Gaia » ; DetailPanel = zone moteur).
2. **Panneau compact de la Carte en mode Détention** : la tuile générique
   « Rendement net » doublonnait « Yield net médian » → remplacée par
   « **Parc E-F** » (part du parc en classes E-F, `parcFor` de lib/energie ;
   municipio = médiane des 15 freguesias, 24 % en résidentiel). Les autres
   modes gardent la tuile Rendement net. `quickFor` expose désormais un champ
   `extra {label, value}`.
   Captures : `gaia_promotion.png` régénérée + `carte_detention.png` (nouveau),
   `vue_ensemble_{residentiel,bureaux,hotellerie}.png` régénérées (ligne
   contexte). Vérifs : `tsc` OK, 18 tests backend, zéro régression ailleurs.

### **Mémo d'investissement** (bouton Sidebar, remplace Export PDF) — **✅ Livré** (2026-07-03)
Troisième moment fort de la démo (après le curseur Haya et l'IA Analyste).
**Architecture** (`backend/routers/memo.py`) :
- `POST /api/memo/draft {scope, asset_class, modes[], angle, instructions?}` :
  contexte = le MÊME `_build_context` nettoyé que l'IA Analyste (désormais
  enrichi de l'actif **Haya Towers** via `_clean(score_asset)` en résidentiel),
  `claude-sonnet-4-6` (temp 0.2) rédige en **JSON strict**
  `{executive_summary, lecture_par_mode, risques, recommandation}` (parse
  robuste + 1 retry). Garde-fous analyste + **règle rang/comptage** (ajoutée
  après tests : le modèle avait écrit « deuxième score » pour le premier et
  compté « six » Céder au lieu de sept — ajoutée AUSSI au prompt analyste).
- `POST /api/memo/render {sections, scope, asset_class, modes[], angle}` :
  les CHIFFRES sont recalculés serveur (`_tables` depuis `_clean(score_city)`,
  jamais du texte IA ni du client), injectés dans le template HTML de marque
  (navy/or/cream, Playfair/Montserrat **variables woff2 embarquées en base64**
  — `backend/assets/fonts/`, ~74 Ko), PDF via **Playwright Python** →
  `Barzel_Memo_Gaia_<Classe>_<date>.pdf`. **5 pages** avec 4 modes (couverture,
  synthèse+KPI ville, 2 modes/page, risques+recommandation+mention légale) —
  la version 1 mode/page faisait 8 pages, compactée pour tenir dans 4-6.
  Scope freguesia : ligne ◆ ajoutée/marquée dans chaque tableau.
- `POST /api/memo/revise {section_id, texte_actuel, consigne, scope,
  asset_class}` : réécrit une seule section (« applique la consigne de façon
  marquée » — sinon « raccourcis » ne réduisait que de 3 %).
**Dépendances backend** (python3) : `anthropic ≥ 0.116`, `playwright`
(le rendu utilise le **Chrome système, canal "chrome"** comme les captures ;
fallback si absent : `python3 -m playwright install chromium`), `pypdf`
(vérifs de test uniquement).
**Frontend** : `MemoModal` (montée dans la Sidebar — d'où `text-ink` explicite
sur le panneau, la Sidebar est `text-cream`) : formulaire (périmètre ville /
freguesia courante via le bridge `lib/session.ts` alimenté par useGaia, classe
préremplie, 4 modes cochés, 3 angles, instructions libres) → relecture
(sections éditables + « Réviser » avec consigne par section ; tableaux moteur
en lecture seule) → « Générer le PDF » (blob + filename du Content-Disposition).
Bouton Sidebar « Mémo d'investissement » (l'Export PDF `window.print` n'existe
plus). Helpers `api.memoDraft/memoRevise/memoRender`.
**Tests** : 3 mémos générés (ville résidentiel Synthèse ; Santa Marinha Note
d'acquisition « insiste sur Haya Towers » — cite désormais les chiffres réels
de l'actif 5 750 €/m² / marge 35,5 % / prime +111 % ; ville bureaux Revue de
détention) — 5 pages chacun, chiffres des textes IA vérifiés contre les
tableaux ; révision « raccourcis la recommandation » : −21 % et resserrée.
Modal contrôlée à l'écran (formulaire + relecture).

### Dé-uniformisation Hôtellerie + audit du sélecteur de freguesias — **✅ Livré** (2026-07-03)
1. **Prix hôteliers continus** (facteurs de zone en pas fins, plus de paliers
   0,05×4 000 = 200 €) : fourchette 2 920-4 880 €/m², front de fleuve en tête,
   hiérarchie conservée, **aucune paire de valeurs identiques**.
2. **Part foncière hôtelière jitterée ±3 pts** autour de 21 % (même jitter
   déterministe que charges/fiscalité détention, clé zone). Marges cibles :
   **Santa Marinha 18,0 % Go, seule tête** ; Canidelo 15,4 % Conditionnel ;
   couronne 7,4-14,1 (⚠️ Mafamude 14,1 dépasse la bande « 6-12 » énoncée —
   verdict Conditionnel conforme, signalé) ; rural −2,5 à −20,1 ; São Félix
   2,5 % Passer. Cap verdict marge < 8 % naturel (Oliveira 7,7 / Arcozelo 7,4).
3. **Anti-jumeaux toutes classes** (`test_no_twin_price_land_pairs`) : pour les
   autres classes commerciales, seul un offset **+0/+1/+2 €** est appliqué aux
   zones PARTAGEANT le même facteur de prix (rang dans le groupe de jumelles) —
   garanti sans collision d'arrondi, ≤ 0,06 pt de marge, zones sans jumelle
   bit-identiques. ⚠️ Piège documenté : les variantes « jitter par classe » et
   « offset en points » basculaient des verdicts limites (bureaux 2→1 Go,
   logistique 15 Cond → 1 Go, commerce 2/4/9 → 2/5/8) — les distributions de
   référence sont exactement conservées (bureaux 2/5/8, logistique 15
   Conditionnel, commerce 2/4/9).
4. **Effets croisés contrôlés** : détention hôtel 2/6/7 et arbitrage 13
   étroites/2 fermées inchangés (spreads recalculés, max +24,5 % à Santa
   Marinha) ; vue-ensemble hôtellerie : dominant arbitrage 56,9 et **insight
   dégradé conservé** ; insight Prix & marge sans marges jumelles (« menées par
   Santa Marinha (18%), Canidelo (15%) et Mafamude (14%) »). **Bascule
   signalée** : landbank **Gulpilhares hôtel → logistique** (uplift hôtel
   renchéri par son foncier jitteré ; logistique −11,4 devant) — la carte des
   usages reste défendable ; foncier max hors prime 864 ≤ 1 200 ✓.
5. **Sélecteur de freguesias — audit 10 pages** (prop `hideSearch` sur Header) :
   réagit sur /gaia (carte), /prix-marge, /rendement, /arbitrage, /foncier
   (filtres) et **désormais /energie** (surlignage + scroll de la ligne du
   parc, simulateur alimenté par la freguesia sélectionnée : « actif type à
   Madalena — 2 860 €/m² · parc E-F 18% » ; retour Toutes les freguesias =
   Santa Marinha) ; **masqué** sur /vue-ensemble (niveau ville), /comparer
   (sélecteurs dédiés), /fiscalite (barèmes ville), /ia-analyste (question
   libre). `RetrofitSimulator` : props `placeLabel`/`efShare`.
6. Vérifs : `tsc` OK, **19 tests** backend, 5 classes contrôlées, capture
   **`shots/prixmarge_hotellerie.png`** (nouvelle) + vue_ensemble régénérées.

### État final du gabarit de page de mode
Les 4 pages partagent : breakdown structuré sur le pilier natif (`marge`,
`rendement_net`, `spread`, `constructibilite`), InsightBanner + insight gradué à
clause signature, KPI viables, tableau triable (groupes de verdict, score desc,
flèches inactives avant tri utilisateur), note d'anomalie `anomalyNote(mode)`,
graphe `MarginBars` paramétré, et un actif K-REST interactif (Haya, Ribeira Sul,
Cais Poente, Monte Claro).
