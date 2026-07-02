"""Barzel Analytics — FastAPI application entrypoint.

Wires the mode-based scoring router. Params / backbone / listings are loaded once
at startup (fail fast if a data file is missing). The legacy Dubai barzel_score
is intentionally left untouched; this app exposes only the new scoring surface.

Run:  uvicorn backend.main:app --reload
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import scoring
from .services import mode_scoring

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
)
log = logging.getLogger("barzel.main")

app = FastAPI(
    title="Barzel Analytics API",
    version="0.1",
    description="Socle data officiel + moteur de scoring par mode (promotion, "
                "détention, arbitrage, landbank).",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev: the Next.js frontend calls from the browser
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scoring.router)


@app.on_event("startup")
def _warm_load() -> None:
    """Load params + backbone + listings once, so the first request is fast and
    a missing/broken data file surfaces at boot rather than mid-request."""
    state = mode_scoring.load(force=True)
    log.info("scoring engine ready: %d zones", len(state.zones))


@app.get("/health")
def health() -> dict:
    state = mode_scoring.load()
    return {"status": "ok", "zones": len(state.zones), "modes": list(mode_scoring.MODES)}


@app.get("/")
def root() -> dict:
    return {
        "app": "Barzel Analytics API",
        "endpoints": [
            "/api/scoring/zone?zone=..&mode=..",
            "/api/scoring/city?city=..&mode=..",
            "/api/scoring/asset?asset=..",
            "/api/scoring/modes",
            "/health",
        ],
    }
