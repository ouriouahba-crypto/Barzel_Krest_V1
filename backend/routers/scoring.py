"""Mode-scoring API router.

    GET /api/scoring/zone?zone=..&mode=..&class=..   -> one detailed score
                                                        (all four modes if mode omitted)
    GET /api/scoring/city?city=..&mode=..            -> ranked zone scores (choropleth)
    GET /api/scoring/asset?asset=..                  -> scores for a named KREST asset
    GET /api/scoring/modes                           -> the four mode keys

Convention multi-villes : le slug voyage dans le paramètre `city` (défaut
« gaia ») ; /zone et /asset l'acceptent en option pour choisir le dataset.
Rétrocompat : sans slug, tout est servi par le dataset par défaut, identique
aux réponses historiques.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from ..services import mode_scoring as ms

log = logging.getLogger("routers.scoring")

router = APIRouter(prefix="/api/scoring", tags=["scoring"])

# Fields that are internal-only (data lineage / confidence). They are computed
# and kept in the engine but stripped from DISPLAY responses by default, so the
# front never surfaces source labels or a confidence index. Pass ?debug=true to
# include them for internal/off-screen use.
_INTERNAL_KEYS = {"data_confidence_index", "confidence", "weights_adjustments",
                  "krest", "source", "_internal"}


def _clean(obj):
    """Recursively drop internal-only keys from a score payload for display."""
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items() if k not in _INTERNAL_KEYS}
    if isinstance(obj, list):
        return [_clean(v) for v in obj]
    return obj


def _present(payload, debug: bool):
    return payload if debug else _clean(payload)


@router.get("/modes")
def modes() -> dict:
    return {"modes": list(ms.MODES)}


@router.get("/zone")
def zone(
    zone: str = Query(..., description="backbone zone id, e.g. santamarinhaesaopedrodaafurada"),
    mode: str | None = Query(None, description="promotion|detention|arbitrage|landbank; all if omitted"),
    asset_class: str | None = Query(None, alias="class", description="asset class override"),
    asset: str | None = Query(None, description="named KREST asset for asset-level inputs"),
    city: str | None = Query(None, description="city slug owning the dataset (default gaia)"),
    debug: bool = Query(False, description="include internal confidence/source fields"),
) -> dict:
    try:
        if mode:
            return _present(ms.score_mode(zone, mode, asset_class, asset, city=city), debug)
        return _present({"zone": zone, "scores": ms.score_all_modes(zone, asset_class, asset, city=city)}, debug)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/city")
def city(
    city: str = Query(..., description="city slug, e.g. gaia, lisbonne, bruxelles"),
    mode: str = Query(..., description="promotion|detention|arbitrage|landbank"),
    asset_class: str | None = Query(None, alias="class", description="asset class (residential|office|hotel|logistics|retail)"),
    debug: bool = Query(False, description="include internal confidence/source fields"),
) -> dict:
    if mode not in ms.MODES:
        raise HTTPException(status_code=400, detail=f"unknown mode {mode!r}")
    results = ms.score_city(city, mode, asset_class)
    if not results:
        raise HTTPException(status_code=404, detail=f"no zones for city {city!r}")
    return _present({"city": city, "mode": mode, "class": asset_class or "residential", "count": len(results), "zones": results}, debug)


@router.get("/asset")
def asset(asset: str = Query(..., description="KREST asset name, e.g. haya, ktower, alcochete"),
          city: str | None = Query(None, description="city slug owning the dataset (default gaia)"),
          debug: bool = Query(False, description="include internal confidence/source fields")) -> dict:
    try:
        return _present(ms.score_asset(asset, city=city), debug)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
