"""Étape 1 : texture generator.

Draws SIMULATED individual listings calibrated on each backbone zone's REAL
distribution, and writes data/listings_sim.csv (same consumption logic as the
old listings_v3.csv).

Calibration, per country:
  * Belgium : sample a TOTAL price from the real quantiles P10/Q25/Q50/Q75/P90
    (piecewise-linear inverse CDF). No BE €/m² is ever fabricated.
  * Portugal : sample a built €/m² around the real median (lognormal, national
    dispersion proxy), draw a habitable surface by typology, total = €/m² ×
    surface. Foreign/national price premium taken from the real fiscal split.

Every listing is labelled synthetic=true, records what it was calibrated_on,
and carries a per-field confidence (officiel/derive real anchors vs simule/
rapport proxies). Seeded => idempotent.

Run:  python -m backend.data.simulate.generate_listings
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import sys
import unicodedata
from statistics import NormalDist

_NORM = NormalDist()

from ..collect.utils import get_logger, write_csv, utc_now_iso, today_iso
from . import sim_config as S

log = get_logger("simulate.generate")

CSV_FIELDS = (
    "listing_id", "country", "city", "zone_id", "zone_name", "level",
    "property_type", "class", "bedrooms", "surface_m2",
    "price_total_eur", "price_eur_m2", "price_eur_m2_basis", "currency",
    "buyer_domicile", "dom_days", "gross_yield_pct", "lat", "lon",
    "as_of", "calibrated_on",
    "price_confidence", "surface_confidence", "eur_m2_confidence",
    "position_confidence", "yield_confidence", "synthetic",
)


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #

def _seed_for(*parts: str) -> int:
    h = hashlib.sha256(("|".join(parts) + f"|{S.SEED}").encode()).hexdigest()
    return int(h[:16], 16)


def _norm(t: str) -> str:
    nfkd = unicodedata.normalize("NFKD", str(t or ""))
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def _pick(rng: random.Random, weighted: dict) -> object:
    r = rng.random() * sum(weighted.values())
    acc = 0.0
    for key, w in weighted.items():
        acc += w
        if r <= acc:
            return key
    return next(iter(weighted))


def _lognormal(rng: random.Random, median: float, log_sigma: float) -> float:
    return median * math.exp(rng.gauss(0.0, log_sigma))


def _stratified_u(rng: random.Random, n: int) -> list[float]:
    """n quasi-uniform draws, one per stratum (i+jitter)/n, then shuffled.

    Stratification slashes the variance of the sample quantiles, so the
    reconstructed distribution matches the real quantiles tightly even at
    moderate n, essential for the ±2 % fidelity check.
    """
    us = [(i + rng.random()) / n for i in range(n)]
    rng.shuffle(us)  # decorrelate listing order from price
    return us


def price_at_u(u: float, quantiles: dict) -> float | None:
    """Piecewise-linear inverse-CDF evaluated at u, from available quantiles.

    quantiles maps p10/q25/q50/q75/p90 -> value (some None). Each knot at
    probability p is reproduced by construction.
    """
    prob = {"p10": 0.10, "q25": 0.25, "q50": 0.50, "q75": 0.75, "p90": 0.90}
    knots = sorted((prob[k], float(v)) for k, v in quantiles.items()
                   if k in prob and v is not None)
    if not knots:
        return None
    if len(knots) == 1:
        return knots[0][1] * math.exp(0.28 * _NORM.inv_cdf(min(max(u, 1e-4), 1 - 1e-4)))
    p_lo, v_lo = knots[0]
    p_hi, v_hi = knots[-1]
    if u <= p_lo:
        nxt_v = knots[1][1]
        floor = max(v_lo * 0.5, v_lo - (nxt_v - v_lo))
        return floor + (v_lo - floor) * (u / p_lo)
    if u >= p_hi:
        prev_p, prev_v = knots[-2]
        slope = (v_hi - prev_v) / (p_hi - prev_p)
        return v_hi + slope * (u - p_hi) * 1.3
    for (p0, v0), (p1, v1) in zip(knots, knots[1:]):
        if p0 <= u <= p1:
            return v0 + (v1 - v0) * (u - p0) / (p1 - p0)
    return v_hi


def _jitter(rng: random.Random, centroid, spread) -> tuple[float, float]:
    lat, lon = centroid
    return round(lat + rng.gauss(0, spread / 2), 5), round(lon + rng.gauss(0, spread / 2), 5)


def _yield_dom(rng: random.Random, country: str, city: str) -> tuple[float, int]:
    base = dict(S.YIELD_PROXY.get(country, S.YIELD_PROXY["pt"]))
    base.update(S.YIELD_CITY_OVERRIDE.get(city, {}))
    y_med, y_sig = base["yield"]
    d_med, d_sig = S.YIELD_PROXY.get(country, S.YIELD_PROXY["pt"])["dom"]
    y = max(1.0, rng.gauss(y_med, y_sig))
    dom = int(_lognormal(rng, d_med, d_sig))
    return round(y, 2), dom


# --------------------------------------------------------------------------- #
# Belgium                                                                      #
# --------------------------------------------------------------------------- #

def _be_generation_types(residential: dict) -> list[dict]:
    """Pick a NON-overlapping set: the apartments type + the houses aggregate."""
    by_type = residential.get("by_type", {})
    out = []
    apt = [(t, v) for t, v in by_type.items() if v.get("class") == "apartment"]
    houses = [(t, v) for t, v in by_type.items() if v.get("class") == "house"]
    if apt:
        t, v = max(apt, key=lambda x: x[1].get("n_transactions") or 0)
        out.append({"label": "Appartement", "class": "apartment", "type": t, "v": v})
    if houses:
        # Prefer the "toutes les maisons ... (excl. appartements)" aggregate to
        # avoid double-counting the façade sub-types.
        agg = [x for x in houses if "toutes les maisons" in _norm(x[0])]
        t, v = (agg[0] if agg else max(houses, key=lambda x: x[1].get("n_transactions") or 0))
        out.append({"label": "Maison", "class": "house", "type": t, "v": v})
    return out


# --------------------------------------------------------------------------- #
# Generation (€/m² × surface, PT and BE symmetric)                             #
# --------------------------------------------------------------------------- #

def _gen_zone(country: str, city: str, zone: dict, factors: dict, rows: list[dict]) -> None:
    """Generate €/m²-priced listings for a zone (PT and BE now symmetric).

    €/m² is sampled around the zone's median_eur_m2 anchor (lognormal, stratified
    so the reconstructed median lands exactly on the anchor); surface is drawn by
    typology; price_total = €/m² × surface. Apartments and houses are stratified
    separately so each group's median €/m² reconstructs on its anchor.
    """
    res = zone["residential"]
    anchor = res.get("median_eur_m2")
    if anchor is None:
        return
    apt_anchor = res.get("median_eur_m2_apartments") or anchor
    n_real = res.get("n_transactions")
    n = min(int(n_real), S.CAP) if n_real else S.CAP_NO_N
    rng = random.Random(_seed_for(country, zone["id"]))

    if country == "be":
        nis5 = zone.get("nis5", "")
        centroid = S.BE_CENTROIDS.get(nis5) or S.PT_CITY_CENTROIDS.get(city)
        jit = S.JITTER_DEG_COMMUNE if nis5 in S.BE_CENTROIDS else S.JITTER_DEG_CITY
        house_share, log_sigma, foreign_share = S.BE_HOUSE_SHARE, S.BE_LOG_SIGMA, 0.0
        house_center = anchor * S.BE_HOUSE_EUR_M2_FACTOR
        calib = f"{city}/{zone['id']} | median €/m² | as_of {res.get('as_of')}"
        prefix = "BE"
    else:
        centroid = S.PT_CITY_CENTROIDS.get(city)
        jit = S.JITTER_DEG_CITY
        house_share, log_sigma = S.PT_HOUSE_SHARE, S.PT_LOG_SIGMA
        foreign_share = S.PT_FOREIGN_SHARE.get(city, S.PT_FOREIGN_SHARE_DEFAULT)
        house_center = anchor
        ratio = factors.get("estrangeiro", 1.0) / max(factors.get("nacional", 1.0), 1e-9)
        calib = (f"{city}/{zone['id']} | median €/m² | as_of {res.get('as_of')}"
                 f" | domicile_share=proxy | premium={ratio:.2f}")
        prefix = "PT"

    n_house = round(n * house_share)
    streams = [("apartment", n - n_house, apt_anchor), ("house", n_house, house_center)]
    idx = 0
    for cls, count, center in streams:
        if count <= 0 or center is None:
            continue
        us = _stratified_u(rng, count)
        for j in range(count):
            eur_m2 = center * math.exp(log_sigma * _NORM.inv_cdf(min(max(us[j], 1e-4), 1 - 1e-4)))
            if cls == "house":
                if country == "be":
                    beds, (surf_med, surf_sig), ptype = _pick(rng, S.BE_HOUSE_BEDROOMS), S.BE_HOUSE_SURFACE, "Maison"
                else:
                    beds, (surf_med, surf_sig), ptype = _pick(rng, {2: 0.2, 3: 0.4, 4: 0.3, 5: 0.1}), S.PT_HOUSE_SURFACE, "Moradia"
            else:
                if country == "be":
                    beds, (surf_med, surf_sig), ptype = _pick(rng, S.BE_APARTMENT_BEDROOMS), S.BE_APARTMENT_SURFACE, "Appartement"
                else:
                    beds = _pick(rng, {b: p[0] for b, p in S.PT_TYPOLOGY.items()})
                    surf_med, surf_sig, ptype = S.PT_TYPOLOGY[beds][1], S.PT_TYPOLOGY[beds][2], f"Apartamento T{beds}"
            surface = round(_lognormal(rng, surf_med, surf_sig))
            price = eur_m2 * surface
            lat, lon = _jitter(rng, centroid, jit) if centroid else ("", "")
            y, dom = _yield_dom(rng, country, city)
            domicile = ("estrangeiro" if rng.random() < foreign_share else "nacional") if country == "pt" else ""
            rows.append({
                "listing_id": f"{prefix}-{zone['id']}-{idx:04d}",
                "country": country, "city": city, "zone_id": zone["id"],
                "zone_name": zone["name"], "level": zone.get("level"),
                "property_type": ptype, "class": cls, "bedrooms": beds,
                "surface_m2": surface,
                "price_total_eur": int(round(price)),
                "price_eur_m2": int(round(eur_m2)),
                "price_eur_m2_basis": "bati_habitable",
                "currency": "EUR", "buyer_domicile": domicile,
                "dom_days": dom, "gross_yield_pct": y, "lat": lat, "lon": lon,
                "as_of": res.get("as_of"), "calibrated_on": calib,
                # Internal-only provenance (not surfaced by the display layer).
                "price_confidence": S.CONF_SIMULE, "surface_confidence": S.CONF_SIMULE,
                "eur_m2_confidence": S.CONF_SIMULE, "position_confidence": S.CONF_SIMULE,
                "yield_confidence": S.CONF_RAPPORT, "synthetic": "true",
            })
            idx += 1


# --------------------------------------------------------------------------- #
# Driver                                                                       #
# --------------------------------------------------------------------------- #

def _pt_factors_from_split(city_zones: list[dict]) -> dict:
    """national/foreign multiplicative factors relative to the overall median."""
    for z in city_zones:
        split = z["residential"].get("buyer_domicile_split")
        if split and split.get("national_eur_m2") and split.get("foreign_eur_m2"):
            nat = float(split["national_eur_m2"])
            foreign = float(split["foreign_eur_m2"])
            overall = z["residential"].get("median_eur_m2") or (nat + foreign) / 2
            return {"nacional": nat / overall, "estrangeiro": foreign / overall}
    return {"nacional": 1.0, "estrangeiro": 1.0}


def generate() -> list[dict]:
    backbone = json.loads(S.BACKBONE.read_text(encoding="utf-8"))
    rows: list[dict] = []
    for city, cdata in backbone.get("cities", {}).items():
        country = cdata.get("country")
        zones = cdata.get("zones", [])
        if country == "pt":
            has_freg = any(z.get("level") == "freguesia" for z in zones)
            factors = _pt_factors_from_split(zones)
            targets = [z for z in zones if (z.get("level") == "freguesia") or not has_freg]
            for z in targets:
                if z["residential"].get("status") == "real":
                    _gen_zone("pt", city, z, factors, rows)
        elif country == "be":
            for z in zones:
                if z.get("level") == "commune" and z["residential"].get("status") == "real":
                    _gen_zone("be", city, z, {}, rows)
    n = write_csv(S.LISTINGS_OUT, CSV_FIELDS, rows)
    by_city: dict[str, int] = {}
    for r in rows:
        by_city[r["city"]] = by_city.get(r["city"], 0) + 1
    log.info("generated %d listings -> %s", n, S.LISTINGS_OUT)
    for c, k in sorted(by_city.items()):
        log.info("  %-20s %d listings", c, k)
    return rows


def main(argv: list[str] | None = None) -> int:
    argparse.ArgumentParser(description="Generate simulated listings.").parse_args(argv)
    log.info("=== listings simulation start (%s, seed=%d) ===", today_iso(), S.SEED)
    try:
        generate()
    except Exception as exc:  # noqa: BLE001
        log.exception("generation crashed: %s", exc)
        return 1
    log.info("=== listings simulation done ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
