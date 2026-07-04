"""Registre des villes : GET /api/cities.

Sert le registre backend/data/cities/registry.json au frontend (slug, nom
affiché, pays, devise, locale et régimes fiscal/énergie). Le sélecteur de
ville du frontend ne se monte que si plusieurs villes sont enregistrées.
"""

from __future__ import annotations

from fastapi import APIRouter

from ..services import cities as city_registry

router = APIRouter(prefix="/api", tags=["cities"])


@router.get("/cities")
def list_cities() -> dict:
    return {"default": city_registry.default_slug(), "cities": city_registry.cities()}
