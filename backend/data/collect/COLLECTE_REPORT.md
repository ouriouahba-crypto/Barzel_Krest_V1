# Rapport de collecte — correctifs €/m² BE + n/yoy PT

Régénéré par `python -m backend.data.collect.pipeline`. Sortie :
`data/backbone.json` (49 zones réelles, 179 secteurs NIS9 imbriqués, 0 a_collecter).

## Champs nouvellement remplis — source / date / confiance

| Champ | Portée | Source | as_of (date) | Confiance | Méthode |
|---|---|---|---|---|---|
| `n_transactions` (+ `n_transactions_source`, `n_transactions_confidence`) | 16 zones PT | INE `ine_local`, indicateur **0014363** ("Vendas de alojamentos familiares nos últimos 12 meses - N.º") | 2025-Q4 | **officiel** | joint sur `geocod`+période à la médiane |
| `yoy_pct` (+ `yoy_confidence`, `yoy_basis`) | 29 zones PT | INE `ine_local`, indicateur 0012234 | t = 2025-Q4 vs t-4 = 2024-Q4 | **derive** | (médiane_t − médiane_t-4)/médiane_t-4 × 100 |
| zones freguesia Gaia | **+15 zones** (Gaia = 16 au total) | INE `ine_local`, 0012234/0012235 | 2025-Q4 | **officiel** | harvest de toutes les freguesias sous le préfixe `11A1317` |
| `median_eur_m2` / `by_type[].eur_m2_derived` (+ `surface_m2`, `surface_as_of`, `eur_m2_confidence`, `eur_m2_source`) | **41 cellules-type "maison"** (Bruxelles 19 communes + MSG, communes ET secteurs) | `statbel_cadastre` (prix) + `statbel_surface` (superficie, fichier `immo_by_municipality`) | prix 2025 · surface **2017** (`surface_as_of`) | **derive** | prix médian ÷ superficie médiane (= MS_TOTAL_SURFACE/MS_TOTAL_TRANSACTIONS) |
| `median_total_eur` + `quantiles` P10-P90 | toutes zones BE | `statbel_cadastre` | 2024 (secteur) / 2025 (commune) | **officiel** | publié par Statbel |
| `buyer_domicile_split` (national/étranger) | Lisboa, V.N. Gaia | INE `ine_local`, 0012231 | 2025-Q4 | **officiel** | Dim3 = domicílio fiscal |

## Ce qui reste `a_collecter` / null (jamais fabriqué)

- **€/m² des APPARTEMENTS belges** : reste `null` (20 cellules). Constat vérifié :
  les appartements n'ont **aucune superficie cadastrale** (pas de parcelle propre)
  dans le fichier `immo_by_municipality` ni ailleurs en open data officiel. Le
  prix total + quantiles restent `officiel` ; l'€/m² appartement est donc marqué
  non-dérivé (`note` explicite). Le €/m² dérivé n'existe que pour les **maisons**.
- **Loyers Bruxelles** : aucun jeu ouvert (IBSA/Observatoire = PDF uniquement).
- **IBSA quartiers** : `data/raw/ibsa_bxl.csv` (145 quartiers, CC0) livré comme
  artefact, mais **non injecté** dans le backbone — son champ `nom_commune` est
  peu fiable (mal étiqueté ; ne mappe que 8 communes). Un croisement spatial sur
  `geo_shape` serait requis pour un rattachement quartier→commune fiable.

## Limites explicites (tracées dans le backbone)

1. **Superficie cadastrale** = terrain/parcelle (orientée maisons), une
   approximation — **pas** une surface habitable certifiée (`surface_basis`).
   Ex. Ixelles maisons : 785 000 € ÷ 161,6 m² ⇒ ~4 858 €/m² de parcelle.
2. **€/m² BE = prix courant (2025) ÷ surface stable (2017)** : acceptable car la
   superficie est structurellement stable ; l'année de surface est tracée.
3. **INE** n'expose ni médiane-variation officielle (yoy calculé en `derive`) —
   confirmé sur les 31 indicateurs de l'opération "Metodologia 2022".

## Vérifications de cohérence (données réelles)

- Ixelles apparts 342 000 € / maisons 785 000 € · Woluwe-St-Pierre apparts
  371 250 € · Anderlecht maisons 341 000 € → concordent avec le contrat.
- Lisboa n=8235, Arroios n=673, V.N. Gaia n=5494 (0014363) → concordent avec la
  vérification live de l'indicateur.
- Confiance présente dans le backbone : `{officiel, derive}` uniquement.
