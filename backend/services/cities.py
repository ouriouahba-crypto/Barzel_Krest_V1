"""Registre des villes + résolution des chemins de données par slug.

Source de vérité : backend/data/cities/registry.json. Chaque ville possède son
répertoire backend/data/cities/<slug>/ (params.json, backbone.json,
listings_sim.csv). Le moteur charge un State par slug (cache mémoire dans
mode_scoring). Convention API : le slug voyage dans le paramètre `city`
(query sur les GET, champ de body sur les POST), défaut « gaia » ; un nom de
ville non enregistré retombe sur le jeu de données par défaut, qui contient
encore les zones témoins historiques (lisbonne, bruxelles, alcochete, loulé,
mont_saint_guibert) : les appels existants restent servis à l'identique.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_SERVICES = Path(__file__).resolve().parent
BACKEND = _SERVICES.parent
CITIES_ROOT = BACKEND / "data" / "cities"
REGISTRY_PATH = CITIES_ROOT / "registry.json"


@lru_cache(maxsize=1)
def registry() -> dict:
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def default_slug() -> str:
    return registry().get("default", "gaia")


def cities() -> list[dict]:
    """Villes enregistrées (sans la clé de commentaire)."""
    return registry().get("cities", [])


def slugs() -> set[str]:
    return {c["slug"] for c in cities()}


def resolve_slug(city: str | None) -> str:
    """Slug de dataset pour un nom de ville : slug enregistré tel quel, sinon
    le défaut (rétrocompat : `city=lisbonne` continue d'être servi par le
    dataset par défaut tant que la ville n'a pas son propre répertoire)."""
    if city and city in slugs():
        return city
    return default_slug()


def data_dir(slug: str) -> Path:
    return CITIES_ROOT / slug


def params_path(slug: str) -> Path:
    return data_dir(slug) / "params.json"


def backbone_path(slug: str) -> Path:
    return data_dir(slug) / "backbone.json"


def listings_path(slug: str) -> Path:
    return data_dir(slug) / "listings_sim.csv"
