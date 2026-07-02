# Barzel — collecteurs de données (socle immobilier officiel)

Pipeline de collecte qui alimente le socle data Barzel × KREST au format
[`barzel_data_backbone_v0.json`](../../../barzel_data_backbone_v0.json).

**Principe** : uniquement des **sources gratuites et officielles** (instituts
statistiques nationaux). Aucun scraping de portail commercial (idealista,
immoweb). Chaque valeur porte sa **source**, sa **date** (`as_of`) et son
**niveau de confiance**. Aucune valeur n'est fabriquée : une zone/champ sans
donnée publiable est marqué `a_collecter` avec des champs `null`.

---

## 1. Arborescence

```
backend/data/collect/
├── config.py           # registre : villes/zones cibles, codes géo, URLs, seuils
├── utils.py            # HTTP (retry/backoff), logging, écritures atomiques
├── ine_pt.py           # PT — INE : médiane €/m² + apparts + split acheteur + n + yoy
├── statbel_be.py       # BE — Statbel : prix + quantiles P10-P90 par commune ET secteur NIS9
├── statbel_surface.py  # BE — Statbel (ancien cadastre) : superficie médiane -> €/m² dérivé
├── ibsa_bxl.py         # BE — IBSA/opendata.brussels : géographie des quartiers (enrichissement)
├── normalize.py        # fusion -> data/backbone.json (conforme au schéma)
├── pipeline.py         # runner : lance les 4 collecteurs puis normalize
├── requirements.txt
└── README.md

data/
├── raw/
│   ├── ine_pt.csv           # brut PT
│   ├── statbel_be.csv       # brut BE prix/quantiles (commune + secteur)
│   ├── statbel_surface.csv  # brut BE superficie médiane par commune+classe
│   ├── ibsa_bxl.csv         # brut quartiers Bruxelles (enrichissement)
│   └── _cache/              # payloads bruts (JSON/ZIP/CSV) — idempotence
├── backbone.json            # SORTIE FINALE (conforme au schéma)
└── backbone.excerpt.json    # extrait lisible
```

## 2. Installation & lancement

```bash
pip install -r backend/data/collect/requirements.txt   # requests (le reste = stdlib)

# Pipeline complet (4 collecteurs + normalize). Réutilise le cache disque.
python -m backend.data.collect.pipeline
python -m backend.data.collect.pipeline --force        # re-télécharge tout

# Étape par étape :
python -m backend.data.collect.ine_pt
python -m backend.data.collect.statbel_be
python -m backend.data.collect.statbel_surface
python -m backend.data.collect.ibsa_bxl
python -m backend.data.collect.normalize
```

Python 3.11+, lancé en **module** depuis la racine du repo. Log réglable via
`BARZEL_LOG_LEVEL=DEBUG`. **Idempotent** : payloads bruts en cache, CSV triés,
écritures atomiques ; relancer sans `--force` ne re-télécharge rien.

## 3. Sources officielles (URLs + identifiants)

### Portugal — INE (API JSON « Base de Dados », param `varcd`, `op=2`)

Endpoint : `https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd={code}&Dim1={période}&Dim2={géo}&Dim3={cat}&lang=PT`

| varcd | Indicateur | Ce qu'on récupère |
|---|---|---|
| **0012234** | médiane €/m² **total** (Dim3 `H1`) | `median_eur_m2` |
| **0012235** | médiane €/m² **appartements** | `median_eur_m2_apartments` |
| **0012231** | split **domicílio fiscal** (Dim3 `1`=national, `2`=étranger) | `buyer_domicile_split` |
| `INE_INDICATOR_NSALES` | **nº de logements vendus** (n transactions) | `n_transactions` — voir note |

- `Dim1=S5A{AAAA}{T}` (dérivé du dernier trimestre publié, ex. `S5A20254`).
- `Dim2` = codes hiérarchiques INE : Lisboa `1A01106`, V.N. Gaia `11A1317`, Loulé `1500808`, Alcochete `1B01502`. Freguesias résolues par nom, contraintes au préfixe du município (évite les homonymes ex. « Santo António » Lisboa vs Funchal).
- **Couverture Gaia élargie** : toutes les freguesias du município sont récupérées automatiquement (harvest sur le préfixe géocode `11A1317`), pas seulement deux.
- **yoy_pct** : calculé de t vs **t-4** (même trimestre, année précédente) → `(médiane_t − médiane_t-4)/médiane_t-4×100`, confidence **`derive`**, `yoy_basis` indique le trimestre de référence. (INE ne publie pas de série de variação homóloga dans l'API.)
- **n_transactions** : l'API des médianes n'expose PAS le nombre de ventes. On le joint via un indicateur INE séparé (`INE_INDICATOR_NSALES`, surchargeable). Tant que ce varcd n'est pas renseigné, `n_transactions` reste **`null`** — jamais fabriqué. Seuil INE : catégorie publiée à partir de **33 ventes**.

### Belgique — Statbel (prix + quantiles)

ZIP → .txt (cp1252) « Ventes de biens immobiliers selon la nature du bien » :

| Fichier | URL | Granularité | Colonnes |
|---|---|---|---|
| Secteurs NIS9 | `.../opendata/Immo%20sector/TF_IMMO_SECTOR.zip` | secteur (`;`) | `CD_STAT_SECTOR, CD_YEAR, CD_TYPE_FR, MS_TRANSACTIONS, MS_P10..MS_P90` |
| Communes NIS5 | `.../opendata/immo/vastgoed_2010_9999.zip` | commune (`|`) | `CD_YEAR, CD_TYPE_FR, CD_REFNIS, CD_PERIOD, MS_TOTAL_TRANSACTIONS, MS_P_25, MS_P_50_median, MS_P_75` |

Filtre : 19 communes de Bruxelles-Capitale (préfixe NIS5 `21`) + Mont-Saint-Guibert (`25068`), agrégat **annuel** (`CD_PERIOD=Y`), niveau commune (`CD_niveau_refnis=5`). Secteurs NIS9 **imbriqués** sous leur commune. Prix total (`median_total_eur`) + quantiles P10-P90 = **`officiel`**. Seuil : **20 transactions**.

### Belgique — superficie (pour le €/m² dérivé) ⚠️ constat vérifié

Les fichiers d'actes ci-dessus **ne contiennent AUCUNE colonne de superficie**.
Le €/m² est donc **dérivé** avec une superficie issue de l'**ancien fichier
cadastral** Statbel, seul jeu officiel gratuit portant superficie + n :

- URL : `.../opendata/Verkoop%20van%20onroerende%20goederen%20per%20gemeente%20(2010-2019)/immo_by_municipality_2010-2019.zip`
- Colonnes : `CD_REFNIS, CD_TYPE_FR, CD_YEAR, CD_PERIOD, MS_TOTAL_TRANSACTIONS, MS_TOTAL_SURFACE, MS_P50, ...`
- `superficie_médiane = MS_TOTAL_SURFACE / MS_TOTAL_TRANSACTIONS` par commune+classe, dernière année disponible (`surface_as_of`, ≈ 2017).
- **`eur_m2_derived = median_total_eur / superficie_médiane`**, confidence **`derive`**, source `statbel_cadastre + statbel_surface`.

Deux limites, explicitées dans le backbone :
1. **Superficie cadastrale** (terrain, orientée parcelle pour les maisons), une **approximation** — pas une surface habitable certifiée (`surface_basis`).
2. **Les appartements n'ont pas de superficie cadastrale** (pas de parcelle propre). Leur `eur_m2` reste donc `null` / `a_collecter`, tandis que **prix total + quantiles restent `officiel`**. Le €/m² dérivé n'existe que pour les **maisons**.

> Le €/m² n'est **pas** figé sur une année de surface : prix courant (2025) ÷ surface stable (≈2017). La superficie étant structurellement stable, c'est acceptable ; l'année est tracée dans `surface_as_of`.

### Belgique — IBSA / opendata.brussels.be

Constat : **aucun jeu ouvert d'€/m² ni de loyers** par quartier/commune (les prix
IBSA sont dérivés de Statbel — prix médian + nº ventes seulement ; les loyers ne
sont publiés qu'en PDF). Le seul jeu machine-lisible (CC0) est la **géographie
des quartiers** (Monitoring des Quartiers), ingérée dans `ibsa_bxl.csv` comme
artefact/enrichissement. ⚠️ Son champ `nom_commune` s'avère **peu fiable**
(mal étiqueté) : il n'est donc **pas** injecté dans le backbone (un croisement
spatial sur `geo_shape` serait nécessaire). Conclusion : le €/m² de Bruxelles est
**dérivé** (Statbel surface), jamais pris d'une source non officielle.
Dataset : `quartiers-du-monitoring-des-quartiers-ibsa-perspective-rbc` (API ODS v2.1).

## 4. Format de sortie (`data/backbone.json`)

Respecte `barzel_data_backbone_v0.json` : `meta`, `sources`, `cities > zones[] >
residential`, `krest_assets`, `collection_todo`. Les six villes (`lisbonne`,
`gaia`, `alcochete`, `loule`, `bruxelles`, `mont_saint_guibert`) ont la même
structure (`country`, `label`, `zones[]`) ; les blocs éditoriaux du contrat
(`market_line`, `residential_ref`, `commercial_market`, `overlays`,
`rents_source`, `krest`, `commercial`, notes) sont **préservés quand ils
existent**. Seule la partie `residential` est (ré)alimentée par la collecte.

`residential` porte les clés canoniques `median_eur_m2, quantiles{p10..p90},
n_transactions, yoy_pct, confidence, source, as_of, status`, plus, côté BE,
`median_total_eur`, `by_type` (détail + `eur_m2_derived`, `surface_m2`,
`surface_as_of` par type), et les secteurs NIS9 **imbriqués** (`sectors[]`).
Chaque valeur dérivée porte sa propre confidence (`eur_m2_confidence`,
`yoy_confidence`, `n_transactions_confidence`).

**Confiance** (aligné sur `meta.confidence_levels`) : `officiel` (INE/Statbel
publié), `derive` (calculé : €/m² BE, yoy PT), `rapport` (broker gratuit),
`a_collecter` (zone/champ réel non extrait).

## 5. Étendre / configurer (variables d'env)

`INE_INDICATOR_TOTAL/APARTMENTS/FISCAL/NSALES`, `INE_YOY_FROM_TMINUS4`,
`STATBEL_SECTOR_URL`, `STATBEL_COMMUNE_URL`, `STATBEL_SURFACE_URL`,
`STATBEL_ENCODING`, `STATBEL_DELIMITER`, `IBSA_QUARTIERS_DATASET`,
`IBSA_ODS_BASE`. Zones PT : `INE_TARGETS` / `INE_HARVEST_FREGUESIAS`. Communes
BE : préfixe `21` automatique + `STATBEL_EXTRA_COMMUNES`. Seuils :
`INE_MIN_TRANSACTIONS` (33), `STATBEL_MIN_TRANSACTIONS` (20),
`STATBEL_SURFACE_MIN_TX` (20).

## 6. Robustesse

Session HTTP retry + back-off (408/429/5xx, erreurs réseau), timeouts
(10 s/60 s). Panne d'une source → cibles en `a_collecter` (jamais inventé, jamais
d'arrêt du pipeline). Écritures atomiques. Détection du challenge anti-bot
Statbel (ZIP vs HTML). Troncatures loggées.
