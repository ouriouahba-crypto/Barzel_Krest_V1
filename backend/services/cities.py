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


# Pool de zones témoins historiques : socle de percentiles partagé + rétrocompat
# des anciens noms de ville (`city=bruxelles`…) et des zones/actifs témoins.
WITNESS_SLUG = "witness"
WITNESS_DIR = BACKEND / "data" / "witness"


@lru_cache(maxsize=1)
def witness_city_names() -> set[str]:
    if not (WITNESS_DIR / "backbone.json").exists():
        return set()
    b = json.loads((WITNESS_DIR / "backbone.json").read_text(encoding="utf-8"))
    return set(b.get("cities", {}))


def resolve_slug(city: str | None) -> str:
    """Slug de dataset pour un nom de ville : slug enregistré tel quel ; nom de
    ville témoin (bruxelles, alcochete…) → pool témoin (rétrocompat) ; sinon le
    défaut."""
    if city == WITNESS_SLUG:
        return WITNESS_SLUG
    if city and city in slugs():
        return city
    if city and city in witness_city_names():
        return WITNESS_SLUG
    return default_slug()


def data_dir(slug: str) -> Path:
    if slug == WITNESS_SLUG:
        return WITNESS_DIR
    return CITIES_ROOT / slug


def params_path(slug: str) -> Path:
    return data_dir(slug) / "params.json"


def backbone_path(slug: str) -> Path:
    return data_dir(slug) / "backbone.json"


def listings_path(slug: str) -> Path:
    return data_dir(slug) / "listings_sim.csv"


def label_for(city: str | None) -> str:
    """Libellé affiché de la ville (registre) ; défaut pour témoins/inconnus."""
    slug = resolve_slug(city)
    for c in cities():
        if c["slug"] == slug:
            return c["label"]
    return next((c["label"] for c in cities() if c["slug"] == default_slug()), "Vila Nova de Gaia")
