# Barzel — couche texture (biens simulés)

Génère une densité **au niveau du bien** en échantillonnant les distributions
**réelles** de chaque zone du backbone officiel. Sert uniquement à la carte et à
la densité pour le KPI engine. **Aucune vérité de marché n'est inventée** : les
agrégats affichés restent ceux de `data/backbone.json`.

## Lancer

```bash
python -m backend.data.simulate.generate_listings   # -> data/listings_sim.csv
python -m backend.data.simulate.validate            # -> FIDELITY_REPORT.md (exit 2 si FAIL strict)
```

Seedé (`BARZEL_SIM_SEED`, défaut 42) → **idempotent** (sortie identique bit-à-bit).

## Calibration (par pays)

- **Belgique** — prix TOTAL échantillonné depuis les quantiles réels
  P10/Q25/Q50/Q75/P90 (inverse-CDF linéaire par morceaux, tirage **stratifié**
  pour reconstruire les quantiles au %). **Aucun €/m² belge n'est fabriqué**
  (`price_eur_m2` vide) : la métrique native BE est le prix total.
- **Portugal** — €/m² bâti échantillonné autour de la **médiane réelle**
  (lognormale, σ national proxy, stratifié → médiane reconstruite = médiane
  réelle), surface tirée par typologie, `prix_total = €/m² × surface`.

## Provenance & étiquetage

Chaque bien porte `synthetic=true`, `calibrated_on` (zone + source + as_of), et
une confidence **par champ** :
- `price_confidence` = `officiel` (BE, ancré sur quantiles publiés) ou `simule`
  (PT, dérivé d'un €/m² simulé) ;
- `eur_m2_confidence` = `simule` (PT) / vide (BE) ;
- `surface_confidence`, `position_confidence` = `simule` (proxys) ;
- `yield_confidence` = `rapport` (proxys DOM/rendement calibrés sur outlooks brokers).

`buyer_domicile` (PT) est un **proxy** de part (les parts réelles ne sont pas
publiées) ; la prime prix national/étranger réelle reste au niveau município
dans le backbone (tracée dans `calibrated_on`).

Coordonnées `lat`/`lon` = centroïde de zone (fait géographique public) + jitter,
toujours `position_confidence=simule`.

## Fidélité

`validate.py` ré-agrège les biens par zone et vérifie que la médiane (et, pour
BE, les quantiles publiés) retombent sur le backbone à **±2 %** (±5 % pour les
petites zones, n<150). Voir [FIDELITY_REPORT.md](FIDELITY_REPORT.md). Une zone
hors tolérance est marquée **FAIL** (jamais publiée en silence) ; `validate`
sort en code 2 si une zone stricte échoue.

## Anti-double-comptage

Génération au **niveau le plus fin non chevauchant** : freguesias (PT, sinon
município), communes (BE — les secteurs NIS9 imbriqués ne sont pas re-simulés).
Côté BE, seuls deux flux non chevauchants par commune : `Appartement` +
`Maison` (agrégat « toutes les maisons », pas les sous-types de façades).
