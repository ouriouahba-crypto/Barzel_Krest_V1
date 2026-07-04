"""Mode-based scoring engine.

Replaces Dubai's single Barzel Score with FOUR scores, one per investment mode
(promotion, detention, arbitrage, landbank). Each is on 100, decomposed into
readable pillars, with a verdict and a data-confidence index.

Inputs (loaded once at startup):
  * backend/data/cities/<slug>/params.json     : curated params (weights, bands, verdicts,
                                    fiscalité, yields, zone attributes, KREST).
  * backend/data/cities/<slug>/backbone.json   : official real aggregates per zone.
  * backend/data/cities/<slug>/listings_sim.csv : simulated listings (density; DOM/mix).
One State per city slug (cache mémoire) ; le registre vit dans
backend/data/cities/registry.json (services/cities.py).

Contract honoured:
  * Hybrid normalisation: absolute bands for business-sense metrics (marge %,
    yield net %, spread %); percentile over the socle for positioning metrics.
  * No fabrication: a pillar with no input returns 'non_pertinent' and is
    dropped from the total with reweighting, never an invented number.
  * Every output value carries its confidence.
"""

from __future__ import annotations

import hashlib
import json
import logging
import statistics
from bisect import bisect_left
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import cities

log = logging.getLogger("services.mode_scoring")

# --------------------------------------------------------------------------- #
# Paths                                                                        #
# --------------------------------------------------------------------------- #

_SERVICES = Path(__file__).resolve().parent
BACKEND = _SERVICES.parent
REPO_ROOT = BACKEND.parent

MODES = ("promotion", "detention", "arbitrage", "landbank")

# confidence vocabulary + ordering (officiel > rapport > derive > hypothese)
OFFICIEL, DERIVE, RAPPORT, HYPOTHESE, NON_PERTINENT = (
    "officiel", "derive", "rapport", "hypothese", "non_pertinent")
_SUPPORTED = {OFFICIEL, DERIVE, RAPPORT}
_CONF_RANK = {OFFICIEL: 3, RAPPORT: 2, DERIVE: 1, HYPOTHESE: 0}


def _worst_conf(confs) -> str:
    valid = [c for c in confs if c in _CONF_RANK]
    return min(valid, key=lambda c: _CONF_RANK[c]) if valid else HYPOTHESE


def _derived_conf(*confs) -> str:
    """A derived pillar caps at 'derive' and inherits the LOWEST input confidence,
    so a value resting on a 'hypothese' param is itself 'hypothese' for the index."""
    return _worst_conf([DERIVE, *confs])


# --------------------------------------------------------------------------- #
# Result types                                                                 #
# --------------------------------------------------------------------------- #

@dataclass
class Pillar:
    key: str
    subscore: float | None            # 0-100, or None when non-pertinent
    native_value: Any                 # readable native metric
    native_unit: str
    native_label: str
    why: str
    confidence: str
    weight: float = 0.0               # effective weight after adjust/reweight
    breakdown: dict | None = None     # structured derived economics (e.g. promo cost stack)

    @property
    def applicable(self) -> bool:
        return self.subscore is not None and self.confidence != NON_PERTINENT

    def to_dict(self) -> dict:
        d = {
            "pillar": self.key,
            "subscore": round(self.subscore, 1) if self.subscore is not None else None,
            "native": {"value": self.native_value, "unit": self.native_unit,
                       "label": self.native_label},
            "why": self.why,
            "confidence": self.confidence,
            "weight": round(self.weight, 3),
            "applicable": self.applicable,
        }
        if self.breakdown is not None:
            d["breakdown"] = self.breakdown
        return d


def _np(key: str, why: str) -> Pillar:
    return Pillar(key, None, None, "", "non pertinent ici", why, NON_PERTINENT)


# --------------------------------------------------------------------------- #
# Loaded state + socle distributions                                          #
# --------------------------------------------------------------------------- #

@dataclass
class State:
    params: dict
    zones: dict                       # zone_id -> zone record (+ city/country)
    socle: dict = field(default_factory=dict)   # metric -> sorted list
    listings_by_zone: dict = field(default_factory=dict)  # zone_id -> stats
    price_med_cache: dict = field(default_factory=dict)   # (city, cls) -> median price


_STATES: dict[str, State] = {}


def _pv(node, default=None):
    """Extract .value from a {value,unit,conf,src} param node, or pass through."""
    if isinstance(node, dict) and "value" in node:
        return node["value"]
    return node if node is not None else default


def _pc(node, default=HYPOTHESE):
    return node.get("conf", default) if isinstance(node, dict) else default


def _adapt_params(raw: dict) -> dict:
    """Map the authoritative barzel_params_v0 structure to the engine's internal
    schema. Keeps the pillar functions stable; the real file drives every value.
    Numbers the file leaves as qualitative notes (e.g. BE précompte / share-deal
    exit) become clearly-labelled 'hypothese' proxies, never silent officiels.
    """
    P: dict = {"_raw": raw}
    g = raw.get("global", {})
    dev_stack = _pv(g.get("dev_cost_stack_pct"), 18)
    coc = _pv(g.get("cost_of_capital_pct"), 7.5)
    debt = _pv(g.get("senior_debt_rate_pct"), 4.5)
    ltv = _pv(g.get("ltv_max_pct"), 60) / 100.0
    wacc = round(ltv * debt + (1 - ltv) * coc, 2)
    P["global"] = {"dev_cost_stack_pct": dev_stack, "senior_debt_rate_pct": debt,
                   "ltv_max_pct": _pv(g.get("ltv_max_pct"), 60),
                   # build years for the promotion financing carry (not in params -> default)
                   "promotion_build_years": _pv(g.get("promotion_build_years"), 3)}
    P["cost_of_capital_pct"] = {"pt": coc, "be": coc}
    P["wacc_pct"] = {"pt": wacc, "be": wacc}

    C = raw.get("countries", {})

    def _fisc(cc: str) -> dict:
        acq = C[cc]["acquisition"]
        if cc == "pt":
            acquisition = _pv(acq["imt_effective_pct"]) + _pv(acq["stamp_duty_is_pct"]) + _pv(acq["notary_registration_pct"])
            det, det_conf = _pv(C[cc]["holding"]["imi_pct"]), OFFICIEL
            ex, ex_conf = _pv(C[cc]["exit"]["corporate_gains_pct"]), OFFICIEL
            vat = _pv(C[cc]["vat"]["construction_standard_pct"])
        else:
            acquisition = _pv(acq["registration_brussels_pct"]) + _pv(acq["notary_pct"])
            det, det_conf = 1.1, HYPOTHESE      # précompte immobilier non chiffré -> proxy
            ex, ex_conf = 4.0, RAPPORT          # cession share-deal -> friction résiduelle faible
            vat = _pv(C[cc]["vat"]["newbuild_pct"])
        vat_conf = OFFICIEL  # PT construction_standard / BE newbuild are both 'officiel'
        return {"acquisition_pct": acquisition, "detention_annual_pct": det, "exit_cgt_pct": ex,
                "vat_new_pct": vat, "acq_conf": OFFICIEL, "det_conf": det_conf,
                "exit_conf": ex_conf, "vat_conf": vat_conf}

    P["fiscalite"] = {"pt": _fisc("pt"), "be": _fisc("be")}

    cc_ = raw.get("construction_cost", {})
    P["construction_costs_eur_m2"] = {
        "pt": {"residential": _pv(cc_["pt"]["residential_standard"]),
               "residential_high": _pv(cc_["pt"]["residential_high_nzeb"])},
        "be": {"residential": _pv(cc_["be"]["residential_standard"]),
               "residential_high": _pv(cc_["be"]["residential_high"])},
        "land_cost_default_frac_of_sale": 0.18,
    }
    P["_cc_conf"] = _pc(cc_["pt"]["residential_standard"])

    cls = raw.get("classes", {})

    def _y(node):
        return _pv(node) if node else None

    P["yields_prime_pct"] = {
        "pt": {"residential": _y(cls["residential"].get("pt_prime_gross_yield_pct")),
               "office": _y(cls["office"].get("pt_prime_yield_pct")),
               "hotel": _y(cls["hotel"].get("pt_prime_yield_pct")),
               "logistics": _y(cls["logistics"].get("pt_prime_yield_pct"))},
        "be": {"residential": _y(cls["residential"].get("be_prime_gross_yield_pct")),
               "office": _y(cls["office"].get("be_prime_yield_pct")),
               "logistics": _y(cls["logistics"].get("be_prime_yield_pct")),
               "living": _y(cls["living"].get("be_net_yield_pct"))},
    }
    P["city_yields"] = {"gaia": {"residential": _y(cls["residential"].get("pt_gaia_gross_yield_pct"))}}
    P["_yields_conf"] = _pc(cls["residential"].get("pt_prime_gross_yield_pct"), RAPPORT)
    P["institutional_appetite"] = {
        k: _pv(v["institutional_appetite"]) / 100.0
        for k, v in cls.items() if isinstance(v, dict) and "institutional_appetite" in v
    }
    P["charges_pct"] = {"pt": {"detention": 1.0, "vacance": 4.0},
                        "be": {"detention": 1.2, "vacance": 5.0}}

    P["energy_meps"] = {
        "pt": {"min_label": "F/G", "deadline": "~2030-2033", "risk_0_100": 35,
               "confidence": HYPOTHESE, "note": _pv(C["pt"]["energy_meps"]["meps_horizon"])},
        "be": {"min_label": "E", "deadline": 2033, "risk_0_100": 60,
               "confidence": HYPOTHESE, "note": _pv(C["be"]["energy_meps"]["brussels_threshold"])},
    }
    P["incentives_2026"] = {
        "pt": {"score_0_100": 65, "labels": [_pv(C["pt"]["incentives_2026"])], "confidence": RAPPORT},
        "be": {"score_0_100": 48, "labels": ["abattement 200k eur", "primes renovation"], "confidence": RAPPORT},
    }

    best_use = {
        "parquedasnacoes": ["office", "residential", "hotel"],
        "marvila": ["residential", "logistics"], "alcochete": ["residential", "logistics"],
        "santamarinhaesaopedrodaafurada": ["residential", "hotel"],
    }
    zones_out: dict[str, dict] = {}
    for zid, zd in raw.get("zones", {}).items():
        if not isinstance(zd, dict) or "constructibility" not in zd:
            continue
        e: dict = {}
        if "constructibility" in zd:
            e["constructibilite"] = _pv(zd["constructibility"]); e["constructibilite_conf"] = _pc(zd["constructibility"])
        if "connectivity" in zd:
            e["connectivite"] = _pv(zd["connectivity"]); e["connectivite_conf"] = _pc(zd["connectivity"])
        if "cycle_momentum" in zd:
            e["cycle_momentum"] = _pv(zd["cycle_momentum"]); e["cycle_momentum_conf"] = _pc(zd["cycle_momentum"])
        if zid in best_use:
            e["best_use"] = best_use[zid]
        zones_out[zid] = e
    if "alcochete" in zones_out:
        zones_out["alcochete"]["overlays_risk_0_100"] = 60
        zones_out["alcochete"]["overlays_risk_0_100_conf"] = RAPPORT
    P["zones"] = zones_out
    P["zone_defaults"] = {
        "pt": {"constructibilite": 50, "connectivite": 55, "overlays_risk_0_100": 40,
               "best_use": ["residential", "office", "hotel"]},
        "be": {"constructibilite": 45, "connectivite": 70, "overlays_risk_0_100": 45,
               "best_use": ["residential", "living"]},
    }
    P["city_tags"] = {"loule": "balneaire", "alcochete": "airport_zone"}
    P["new_build_premium_by_zone"] = raw.get("new_build_premium_by_zone", {})
    P["land_cost_eur_m2_by_zone"] = raw.get("land_cost_eur_m2_by_zone", {})
    P["commercial_gaia"] = raw.get("commercial_gaia", {})

    A = raw.get("assets", {})
    krest: dict[str, dict] = {}
    if "k_tower" in A:
        a = A["k_tower"]
        krest["ktower"] = {"name": "K-Tower", "city": a.get("city", "lisbonne"),
                           "zone": a.get("zone", "parquedasnacoes"), "class": a.get("class", "office"),
                           "primary_mode": "arbitrage", "spread_pct": _pv(a.get("spread_pct")),
                           "confidence": RAPPORT}
        krest["k_tower"] = krest["ktower"]
    if "haya_towers" in A:
        a = A["haya_towers"]
        krest["haya"] = {"name": "Haya Towers", "city": a.get("city", "gaia"),
                         "zone": a.get("zone", "santamarinhaesaopedrodaafurada"),
                         "class": a.get("class", "residential"), "primary_mode": "promotion",
                         "achievable_sale_eur_m2": _pv(a.get("target_price_eur_m2")),
                         "construction_eur_m2": _pv(a.get("construction_eur_m2"), 2065),
                         "land_cost_eur_m2": _pv(a.get("land_cost_eur_m2"), 1300),
                         "premium_pct": _pv(a.get("premium_vs_freguesia_pct")), "confidence": RAPPORT}
        krest["haya_towers"] = krest["haya"]
    if "alcochete_landbank" in A:
        a = A["alcochete_landbank"]
        krest["alcochete"] = {"name": "Alcochete Landbank", "city": a.get("city", "alcochete"),
                              "zone": "alcochete", "class": a.get("class", "landbank"),
                              "primary_mode": "landbank", "confidence": RAPPORT}
        krest["alcochete_landbank"] = krest["alcochete"]
    P["krest_assets"] = krest

    sc = raw["scoring"]
    P["scoring"] = {
        "weights": {m: {k: v for k, v in sc["weights"][m].items() if k != "note"} for m in MODES},
        "adjustments": _adapt_adjustments(sc.get("adjustments", {})),
        "bands": _adapt_bands(sc["bands"]),
        "verdicts": _adapt_verdicts(sc["verdicts"]),
        "data_confidence_index": {"eleve": 0.7, "moyen": 0.4,
                                  "labels": {"eleve": "eleve", "moyen": "moyen", "bas": "indicatif"}},
        "overheating_yoy_pct": 20.0, "cycle_peak_yoy_pct": 10.0,
    }
    return P


def _adapt_adjustments(adj: dict) -> list[dict]:
    out = []
    if "balneaire_risque_sortie_boost" in adj:
        out.append({"when": {"city_tag": "balneaire"}, "modes": ["promotion", "detention"],
                    "deltas": {"risque_sortie": _pv(adj["balneaire_risque_sortie_boost"])},
                    "why": "balneaire: risque de sortie renforcé (dépendance demande étrangère)"})
    if "landbank_connectivite_boost" in adj:
        out.append({"when": {"city_tag": "airport_zone"}, "modes": ["landbank"],
                    "deltas": {"connectivite": _pv(adj["landbank_connectivite_boost"])},
                    "why": "infrastructure structurante: connectivité renforcée"})
    return out


def _adapt_bands(bands: dict) -> dict:
    def pts(b: dict, low: tuple) -> list:
        faible, correct, bon = b["faible"], b["correct"], b["bon"]
        high = bon + (bon - correct)
        return [list(low), [faible, 40], [correct, 62], [bon, 82], [high, 95]]
    return {
        "marge_pct": pts(bands["promotion_marge_pct"], (0, 8)),
        "yield_net_pct": pts(bands["detention_yield_net_pct"], (1.0, 8)),
        "spread_pct": pts(bands["arbitrage_spread_pct"], (-10, 5)),
    }


def _adapt_verdicts(vr: dict) -> dict:
    out = {}
    for mode, spec in vr.items():
        if mode not in MODES:
            continue
        labels = spec["labels"]
        thr = sorted((v for k, v in spec.items() if k != "labels"), reverse=True)
        out[mode] = [{"min": thr[0], "label": labels[0]},
                     {"min": thr[1], "label": labels[1]},
                     {"min": 0, "label": labels[2]}]
    return out


def load(city: str | None = None, force: bool = False) -> State:
    """State du dataset de la ville (slug enregistré, sinon dataset par
    défaut : rétrocompat des zones témoins). Cache mémoire par slug."""
    slug = cities.resolve_slug(city)
    if slug in _STATES and not force:
        return _STATES[slug]
    raw = json.loads(cities.params_path(slug).read_text(encoding="utf-8"))
    params = _adapt_params(raw)
    backbone = json.loads(cities.backbone_path(slug).read_text(encoding="utf-8"))

    zones: dict[str, dict] = {}
    for city, cdata in backbone.get("cities", {}).items():
        for z in cdata.get("zones", []):
            zones[z["id"]] = {
                "id": z["id"], "name": z.get("name"), "city": city,
                "country": cdata.get("country"), "level": z.get("level"),
                "residential": z.get("residential", {}),
                "krest": z.get("krest"),
            }

    listings_by_zone = _load_listings_stats(slug)

    st = State(params=params, zones=zones, listings_by_zone=listings_by_zone)
    # Socle de percentiles : les métriques de la ville sont classées dans un
    # UNIVERS DE RÉFÉRENCE = zones de la ville + pool témoin partagé
    # (backend/data/witness/). Pour gaia, l'univers reconstitué est exactement
    # celui d'avant l'extraction des témoins (49 zones) : payloads identiques
    # aux octets. Les valeurs de la ville priment sur le pool en cas de clé
    # commune (fusion ville-en-dernier).
    if slug != cities.WITNESS_SLUG and cities.witness_city_names():
        st.socle = _build_socle(_socle_universe(raw, zones, listings_by_zone))
    else:
        st.socle = _build_socle(st)
    _STATES[slug] = st
    log.info("mode_scoring loaded [%s]: %d zones, %d zones with listings",
             slug, len(zones), len(listings_by_zone))
    return st


def _witness_pool() -> tuple[dict, dict, dict]:
    """(params bruts, zones, stats listings) du pool témoin, chargé une fois."""
    global _WITNESS_POOL
    if _WITNESS_POOL is None:
        raw = json.loads(cities.params_path(cities.WITNESS_SLUG).read_text(encoding="utf-8"))
        backbone = json.loads(cities.backbone_path(cities.WITNESS_SLUG).read_text(encoding="utf-8"))
        zones: dict[str, dict] = {}
        for city, cdata in backbone.get("cities", {}).items():
            for z in cdata.get("zones", []):
                zones[z["id"]] = {
                    "id": z["id"], "name": z.get("name"), "city": city,
                    "country": cdata.get("country"), "level": z.get("level"),
                    "residential": z.get("residential", {}),
                    "krest": z.get("krest"),
                }
        _WITNESS_POOL = (raw, zones, _load_listings_stats(cities.WITNESS_SLUG))
    return _WITNESS_POOL


_WITNESS_POOL: tuple[dict, dict, dict] | None = None


def _socle_universe(city_raw: dict, city_zones: dict, city_stats: dict) -> "State":
    """State jetable servant uniquement au socle : pool témoin + ville, la
    ville l'emportant sur toute clé commune (tables par zone incluses)."""
    w_raw, w_zones, w_stats = _witness_pool()
    merged_raw = dict(w_raw)
    merged_raw.update({k: v for k, v in city_raw.items()
                       if k not in ("zones", "new_build_premium_by_zone", "land_cost_eur_m2_by_zone")})
    for tbl in ("zones", "new_build_premium_by_zone", "land_cost_eur_m2_by_zone"):
        merged_raw[tbl] = {**w_raw.get(tbl, {}), **city_raw.get(tbl, {})}
    return State(params=_adapt_params(merged_raw),
                 zones={**w_zones, **city_zones},
                 listings_by_zone={**w_stats, **city_stats})


def _load_listings_stats(slug: str) -> dict[str, dict]:
    """Per-zone DOM median, listing count, dominant-class share (from sim CSV)."""
    stats: dict[str, dict] = {}
    path = cities.listings_path(slug)
    if not path.exists():
        log.warning("listings_sim.csv missing: absorption pillar will be limited")
        return stats
    import csv
    doms: dict[str, list] = {}
    cls_counts: dict[str, dict] = {}
    for r in csv.DictReader(path.open(encoding="utf-8")):
        z = r["zone_id"]
        try:
            doms.setdefault(z, []).append(float(r["dom_days"]))
        except (ValueError, KeyError):
            pass
        cls_counts.setdefault(z, {}).setdefault(r.get("class", "?"), 0)
        cls_counts[z][r["class"]] += 1
    for z, d in doms.items():
        counts = cls_counts.get(z, {})
        total = sum(counts.values()) or 1
        dominant = max(counts.values()) / total if counts else 0.0
        stats[z] = {
            "dom_median": statistics.median(d),
            "n_listings": len(d),
            "class_concentration": dominant,  # 0-1, higher = more concentrated
        }
    return stats


# --------------------------------------------------------------------------- #
# Socle (percentile reference distributions)                                  #
# --------------------------------------------------------------------------- #

def _zone_param(st: State, zone_id: str) -> dict:
    return st.params.get("zones", {}).get(zone_id, {})


def _zone_attr(st: State, z: dict, key: str) -> tuple[Any, str]:
    """Zone attribute + confidence: curated param, else country default (hypothese)."""
    zp = _zone_param(st, z["id"])
    if key in zp and zp[key] is not None:
        return zp[key], zp.get(f"{key}_conf") or zp.get("confidence", RAPPORT)
    # A municipio inherits the MEDIAN constructibility of its city's freguesias
    # (rather than the blunt country default), so the city view reflects the mix.
    if key == "constructibilite" and z.get("level") == "municipio":
        vals = [float(v) for zz in st.zones.values()
                if zz["city"] == z["city"] and zz["level"] == "freguesia"
                for v in [_zone_param(st, zz["id"]).get("constructibilite")] if v is not None]
        if vals:
            return round(statistics.median(vals)), DERIVE
    default = st.params.get("zone_defaults", {}).get(z["country"], {})
    if key in default:
        return default[key], HYPOTHESE
    return None, NON_PERTINENT


def _absorption_months(st: State, zone_id: str) -> float | None:
    s = st.listings_by_zone.get(zone_id)
    if not s:
        return None
    # months to clear a proxy pipeline: DOM plus a depth discount for thin markets.
    return round(s["dom_median"] / 30.0, 2)


def _best_use_value(st: State, z: dict) -> tuple[float | None, str | None]:
    """Indicative best-use value €/m² across candidate classes (PT only)."""
    zp = _zone_param(st, z["id"])
    base = zp.get("comparables_eur_m2") or z["residential"].get("median_eur_m2")
    if not base:
        return None, None
    factors = {"residential": 1.0, "office": 1.12, "hotel": 1.22,
               "logistics": 0.6, "retail": 0.9, "living": 1.05}
    default_bu = st.params.get("zone_defaults", {}).get(z["country"], {}).get("best_use", ["residential"])
    best_cls, best_val = None, 0.0
    for cls in zp.get("best_use", default_bu):
        v = base * factors.get(cls, 1.0)
        if v > best_val:
            best_val, best_cls = v, cls
    return round(best_val), best_cls


def _res_market_rent(st: State, z: dict) -> float | None:
    """Residential market rent €/m²/year (price × zone-adjusted gross yield) ;
    the depth proxy for rental demand, whatever the asset class studied."""
    gross = _p(st, "city_yields", z["city"], "residential") \
        or _p(st, "yields_prime_pct", z["country"], "residential")
    price = _class_price(st, z, "residential")
    if gross is None or not price:
        return None
    ref = _city_price_median(st, z["city"], "residential")
    if ref:
        gross = gross * (ref / price) ** 0.4
    return price * gross / 100.0


def _build_socle(st: State) -> dict[str, list]:
    metrics = {"constructibilite": [], "connectivite": [], "momentum": [],
               "absorption_speed": [], "resilience": [], "best_use_value": [],
               "demande_locative": [], "liquidite": []}
    for zid, z in st.zones.items():
        c, _ = _zone_attr(st, z, "constructibilite")
        if c is not None:
            metrics["constructibilite"].append(float(c))
        conn, _ = _zone_attr(st, z, "connectivite")
        if conn is not None:
            metrics["connectivite"].append(float(conn))
        yoy = z["residential"].get("yoy_pct")
        if yoy is not None:
            metrics["momentum"].append(float(yoy))
        am = _absorption_months(st, zid)
        if am:
            metrics["absorption_speed"].append(1.0 / am)  # faster = higher
        if conn is not None:
            vac = st.params.get("charges_pct", {}).get(z["country"], {}).get("vacance", 5)
            metrics["resilience"].append(0.65 * float(conn) + 0.35 * max(0, 100 - vac * 6))
        bv, _ = _best_use_value(st, z)
        if bv:
            metrics["best_use_value"].append(float(bv))
        rent = _res_market_rent(st, z)
        if rent:
            metrics["demande_locative"].append(rent)
        n = z["residential"].get("n_transactions")
        if n:
            metrics["liquidite"].append(float(n))
    return {k: sorted(v) for k, v in metrics.items() if v}


def _percentile(st: State, metric: str, value: float, higher_better: bool = True) -> float:
    arr = st.socle.get(metric)
    if not arr:
        return 50.0
    idx = bisect_left(arr, value)
    pct = 100.0 * idx / len(arr)
    return pct if higher_better else 100.0 - pct


def _band(st: State, metric: str, value: float) -> float:
    pts = st.params["scoring"]["bands"][metric]
    if value <= pts[0][0]:
        return float(pts[0][1])
    if value >= pts[-1][0]:
        return float(pts[-1][1])
    for (x0, s0), (x1, s1) in zip(pts, pts[1:]):
        if x0 <= value <= x1:
            return s0 + (s1 - s0) * (value - x0) / (x1 - x0)
    return float(pts[-1][1])


# --------------------------------------------------------------------------- #
# Shared economics                                                            #
# --------------------------------------------------------------------------- #

def _commercial(st: State, z: dict, cls: str) -> dict | None:
    """Commercial economics {price, yield_pct, construction} for a Gaia zone+class."""
    cg = st.params.get("commercial_gaia", {})
    classes = cg.get("classes") or {}
    if z["city"] != "gaia" or cls not in classes:
        return None
    base = classes[cls]
    zf = cg.get("zone_factors", {})
    factor = (zf.get(z["id"]) or zf.get("default") or {}).get(cls, 1.0)
    price = base["rent_eur_m2_month"] * 12 / (base["yield_pct"] / 100.0) * factor
    return {"price": round(price), "yield_pct": base["yield_pct"],
            "construction": base["construction_eur_m2"], "factor": factor}


def _class_price(st: State, z: dict, cls: str) -> float | None:
    """€/m² for a zone under a class: residential median, or commercial market price."""
    if cls != "residential":
        c = _commercial(st, z, cls)
        if c:
            return float(c["price"])
    med = z["residential"].get("median_eur_m2")
    return float(med) if med is not None else None


def _class_construction(st: State, z: dict, cls: str) -> float | None:
    if cls != "residential":
        c = _commercial(st, z, cls)
        if c:
            return float(c["construction"])
    return _p(st, "construction_costs_eur_m2", z["country"], "residential")


def _city_price_median(st: State, city: str, cls: str) -> float | None:
    """Median class price across a city's fine zones (freguesias / communes)."""
    key = (city, cls)
    if key in st.price_med_cache:
        return st.price_med_cache[key]
    prices = []
    for z in st.zones.values():
        if z["city"] != city or z["level"] not in ("freguesia", "commune"):
            continue
        p = _class_price(st, z, cls)
        if p:
            prices.append(p)
    val = statistics.median(prices) if prices else None
    st.price_med_cache[key] = val
    return val


def _realizable_eur_m2(st: State, z: dict, cls: str, asset: dict | None) -> tuple[float | None, str, str]:
    """(sale €/m², source, confidence). Asset achievable > class price > None."""
    if asset and asset.get("achievable_sale_eur_m2"):
        return float(asset["achievable_sale_eur_m2"]), "asset", asset.get("confidence", RAPPORT)
    price = _class_price(st, z, cls)
    if price is not None:
        conf = z["residential"].get("confidence", DERIVE) if cls == "residential" else RAPPORT
        return price, "class", conf
    return None, "", NON_PERTINENT


def _country(z: dict) -> str:
    return z["country"]


def _new_build_premium(st: State, z: dict) -> float:
    """New-build sale premium (%) over the existing-stock median, per zone.

    Zone table -> Gaia freguesia default -> global default. It's a curated
    parameter (confidence hypothese) and applies ONLY to the zone-without-asset
    case; a named asset keeps its own realizable price."""
    tbl = st.params.get("new_build_premium_by_zone", {})
    val = tbl.get(z["id"])
    if isinstance(val, (int, float)):
        return float(val)
    if z["city"] == "gaia":
        return float(tbl.get("gaia_default", 30))
    return float(tbl.get("default", 30))


def _land_cost_eur_m2(st: State, z: dict) -> float:
    """Zone land cost (€/m² of sellable area), like a developer reasons ; replaces
    the 18%-of-sale estimate. Zone table -> Gaia default -> global default.
    Curated parameter (confidence hypothese); zone-without-asset case only."""
    tbl = st.params.get("land_cost_eur_m2_by_zone", {})
    val = tbl.get(z["id"])
    if isinstance(val, (int, float)):
        return float(val)
    if z["city"] == "gaia":
        return float(tbl.get("gaia_default", 300))
    return float(tbl.get("default", 300))


def _p(st: State, *keys, default=None):
    cur = st.params
    for k in keys:
        if not isinstance(cur, dict) or k not in cur:
            return default
        cur = cur[k]
    return cur


def _commercial_land(st: State, cls: str, zone_id: str, sale: float) -> float:
    """Commercial land cost €/m² for one zone+class. Hotel carries a full ±3 pts
    deterministic jitter on the land share (the class was never finely
    calibrated). The other commercial classes keep their flat share; only
    PRICE-TWIN zones (same class factor, hence same price) get a +0/+1/+2 €
    rank offset : enough to guarantee distinct rounded land values, far too
    small (≤0.06 pt of margin) to move any verdict, and zones without a twin
    stay bit-identical."""
    lp = _p(st, "commercial_gaia", "classes", cls, "land_pct", default=12.0)
    if cls == "hotel":
        return sale * (lp + _split_jitter_pct(zone_id) * 2.0) / 100.0
    land = sale * lp / 100.0
    zf = _p(st, "commercial_gaia", "zone_factors", default={}) or {}

    def factor(z: str) -> float:
        return (zf.get(z) or zf.get("default") or {}).get(cls, 1.0)

    me = st.zones.get(zone_id, {})
    twins = sorted(z for z, d in st.zones.items()
                   if d.get("city") == me.get("city") and d.get("level") == me.get("level")
                   and factor(z) == factor(zone_id))
    if len(twins) > 1 and zone_id in twins:
        land += twins.index(zone_id)
    return land


# --------------------------------------------------------------------------- #
# PROMOTION pillars                                                            #
# --------------------------------------------------------------------------- #

def _promo_marge(st: State, z: dict, cls: str, asset: dict | None) -> Pillar:
    sale, src, sale_conf = _realizable_eur_m2(st, z, cls, asset)
    if sale is None:
        return _np("marge", "pas de marché €/m² pour cette zone/classe")
    is_asset = bool(asset and asset.get("achievable_sale_eur_m2"))
    # Residential zone: realizable NEW-build price = existing-stock median + a
    # curated new-build premium. Commercial classes already price at market, and
    # a named asset keeps its own price (no premium in either case).
    premium = None
    base_median = None
    if not is_asset and cls == "residential":
        base_median = sale
        premium = _new_build_premium(st, z)
        sale = base_median * (1 + premium / 100.0)
        sale_conf = HYPOTHESE
    country = _country(z)
    build = _class_construction(st, z, cls) or _p(st, "construction_costs_eur_m2", country, "residential")
    if is_asset and (asset or {}).get("construction_eur_m2"):
        build = float(asset["construction_eur_m2"])   # trophy asset: its own build cost
    zp = _zone_param(st, z["id"])
    comm = _commercial(st, z, cls) if (not is_asset and cls != "residential") else None
    land_note = ""
    if is_asset:      # named asset: its own / default land
        land_from_params = (asset or {}).get("land_cost_eur_m2") or zp.get("land_cost_eur_m2")
        land = land_from_params or sale * _p(st, "construction_costs_eur_m2",
                                             "land_cost_default_frac_of_sale", default=0.18)
        land_conf = ((asset or {}).get("confidence") or zp.get("confidence", RAPPORT)) \
            if land_from_params else HYPOTHESE
    elif comm:        # commercial: land = a % of the class market price (per-zone spread)
        land = _commercial_land(st, cls, z["id"], sale)
        land_conf = HYPOTHESE
        land_note = f"foncier {land:.0f} €/m² ({land / sale * 100:.1f}% du prix {cls}) · "
    else:             # residential zone: real €/m² land cost per zone
        land = _land_cost_eur_m2(st, z)
        land_conf = HYPOTHESE
        land_note = f"foncier {land:.0f} €/m² (paramètre zone) · "
    # VAT on the sale price:
    #  - commercial: recoverable (neutral for the developer) -> 0.
    #  - Portugal residential new-build: NOT VAT-charged on the sale (IMT is on the
    #    buyer; upstream construction VAT is a developer cost, already in construction) -> 0.
    #  - Belgium residential keeps its VAT for now (documented in CLAUDE.md).
    vat = 0.0 if (comm or (cls == "residential" and country == "pt")) \
        else _p(st, "fiscalite", country, "vat_new_pct", default=0.0)
    dev_stack = _p(st, "global", "dev_cost_stack_pct", default=18.0)
    soft = (dev_stack / 100.0) * (build + land)
    # Promotion financing carry: financed share (LTV) × senior debt rate × build years.
    ltv = _p(st, "global", "ltv_max_pct", default=60.0) / 100.0
    debt_rate = _p(st, "global", "senior_debt_rate_pct", default=4.5) / 100.0
    years = _p(st, "global", "promotion_build_years", default=3)
    finance = (build + land) * ltv * debt_rate * years
    cost_total = build + land + soft + finance
    net_sale = sale / (1 + vat / 100.0)
    margin_pct = (net_sale - cost_total) / cost_total * 100.0
    sub = _band(st, "marge_pct", margin_pct)
    prime = None
    med = z["residential"].get("median_eur_m2")
    if asset and med:
        prime = (sale / med - 1) * 100
    # Confidence inheritance: lowest of the params consumed (construction cost,
    # VAT, realizable price, and land when it comes from params).
    inputs = [_p(st, "_cc_conf", default=HYPOTHESE),
              _p(st, "fiscalite", country, "vat_conf", default=OFFICIEL), sale_conf, land_conf]
    conf = _derived_conf(*inputs)
    price_note = ""
    if premium is not None:
        price_note = f"prix neuf réalisable {sale:.0f} €/m² = médiane ancien {base_median:.0f} +{premium:.0f}% · "
    if vat > 0:
        sale_txt = f"vente {sale:.0f} €/m² nette TVA {net_sale:.0f}"
    elif comm:
        sale_txt = f"vente {sale:.0f} €/m² (TVA récupérable)"
    else:
        sale_txt = f"vente {sale:.0f} €/m² (hors TVA sur la vente)"
    why = (f"marge développeur {margin_pct:.0f}% ({price_note}{land_note}{sale_txt}, "
           f"coût {cost_total:.0f} €/m² dont financement {finance:.0f} "
           f"€/m² à {debt_rate*100:.1f}% × {years} ans × LTV {ltv*100:.0f}%)"
           + (f" · prime {prime:.0f}% sur la médiane réelle" if prime is not None else ""))
    # Structured cost stack for the "Prix & marge" module (derived economics, no
    # raw params/confidence exposed). base_median/premium_pct are residential-zone
    # only; commercial classes price at market with no new-build premium.
    breakdown = {
        "base_median": round(base_median) if base_median is not None else None,
        "premium_pct": round(premium, 1) if premium is not None else None,
        "realizable_sale": round(sale),
        "net_sale": round(net_sale),
        "vat_pct": round(vat, 1),
        "construction": round(build),
        "land": round(land),
        "soft": round(soft),
        "finance": round(finance),
        "cost_total": round(cost_total),
        "margin_pct": round(margin_pct, 1),
        "premium_over_median_pct": round(prime, 1) if prime is not None else None,
    }
    return Pillar("marge", sub, round(margin_pct, 1), "%",
                  f"marge {margin_pct:.0f}%", why, conf, breakdown=breakdown)


def _promo_absorption(st: State, z: dict) -> Pillar:
    months = _absorption_months(st, z["id"])
    if months is None:
        return _np("absorption", "aucun bien simulé pour estimer l'absorption")
    sub = _percentile(st, "absorption_speed", 1.0 / months, higher_better=True)
    n = z["residential"].get("n_transactions")
    why = (f"absorption ~{months:.1f} mois (DOM médian simulé)"
           + (f", profondeur {int(n)} ventes/an" if n else ""))
    return Pillar("absorption", sub, months, "mois", f"{months:.1f} mois", why, DERIVE)


def _promo_momentum(st: State, z: dict) -> Pillar:
    yoy = z["residential"].get("yoy_pct")
    if yoy is None:
        return _np("momentum_prix", "pas de variation homologue réelle disponible")
    sub = _percentile(st, "momentum", yoy, higher_better=True)
    over = _p(st, "scoring", "overheating_yoy_pct", default=20.0)
    note = ""
    if yoy > over:
        # écrête: surchauffe = risque, on ramène vers la neutralité
        sub = 60 + (sub - 60) * 0.4
        note = " (écrêté: signe de surchauffe)"
    conf = _derived_conf(z["residential"].get("yoy_confidence", DERIVE))
    return Pillar("momentum_prix", sub, round(yoy, 1), "%",
                  f"yoy {yoy:+.1f}%", f"momentum prix {yoy:+.1f}%{note}", conf)


def _promo_constructibilite(st: State, z: dict) -> Pillar:
    val, conf = _zone_attr(st, z, "constructibilite")
    if val is None:
        return _np("constructibilite", "constructibilité non paramétrée pour la zone")
    sub = _percentile(st, "constructibilite", float(val))
    return Pillar("constructibilite", sub, val, "/100",
                  f"constructibilité {val}", f"constructibilité {val}/100 (percentile socle)", conf)


def _risque_sortie(st: State, z: dict) -> Pillar:
    split = z["residential"].get("buyer_domicile_split")
    conc = st.listings_by_zone.get(z["id"], {}).get("class_concentration")
    if not split and conc is None:
        return _np("risque_sortie", "ni split acheteur ni mix pour estimer le risque de sortie")
    foreign_dep = 0.0
    detail = []
    if split and split.get("foreign_eur_m2") and split.get("national_eur_m2"):
        premium = split["foreign_eur_m2"] / split["national_eur_m2"] - 1
        foreign_dep = min(1.0, max(0.0, premium * 2.0))  # premium proxy for dependence
        detail.append(f"prime étrangère {premium*100:.0f}%")
    concentration = conc if conc is not None else 0.5
    detail.append(f"concentration typologique {concentration*100:.0f}%")
    risk = 0.6 * foreign_dep + 0.4 * concentration     # 0-1, higher worse
    sub = 100.0 * (1 - risk)
    conf = DERIVE if split else HYPOTHESE
    return Pillar("risque_sortie", sub, round(risk * 100, 0), "/100 risque",
                  f"risque sortie {risk*100:.0f}", "risque de sortie: " + ", ".join(detail), conf)


# --------------------------------------------------------------------------- #
# DETENTION pillars                                                           #
# --------------------------------------------------------------------------- #

def _split_jitter_pct(zone_id: str) -> float:
    """Deterministic per-zone redistribution (±1.5 pts of rent) between the
    charges and fiscalité shares of the yield stack : older condominiums carry
    heavier charges, effective IMI varies with taxable value vs market rent.
    The SUM charges+fiscalité is untouched, so gross and net yields never move."""
    h = int(hashlib.md5(zone_id.encode("utf-8")).hexdigest(), 16)
    return ((h % 3001) - 1500) / 1000.0


def _det_profondeur(st: State, z: dict) -> Pillar:
    """Depth of the rental market: rental demand (market rent level), park size /
    liquidity (transactions), rotation (DOM). An institution holds where the
    letting market is deep, not where the facial yield is highest."""
    rent = _res_market_rent(st, z)
    n = z["residential"].get("n_transactions")
    months = _absorption_months(st, z["id"])
    parts: list[tuple[float, float]] = []
    why = []
    if rent is not None:
        parts.append((0.50, _percentile(st, "demande_locative", rent)))
        why.append(f"loyer de marché ~{rent:.0f} €/m²/an")
    if n:
        parts.append((0.30, _percentile(st, "liquidite", float(n))))
        why.append(f"parc {int(n)} ventes/an")
    if months:
        parts.append((0.20, _percentile(st, "absorption_speed", 1.0 / months)))
        why.append(f"rotation ~{months:.1f} mois")
    if not parts:
        return _np("profondeur_locative", "ni loyer, ni parc, ni rotation pour estimer la profondeur")
    wsum = sum(w for w, _ in parts)
    sub = sum(w * v for w, v in parts) / wsum
    return Pillar("profondeur_locative", sub, round(sub), "/100",
                  f"profondeur {sub:.0f}",
                  "profondeur du marché locatif: " + ", ".join(why) + " (percentile socle)",
                  DERIVE)


def _net_yield_pct(st: State, z: dict, cls: str) -> tuple[float | None, str, str, dict | None]:
    country = _country(z)
    if cls != "residential":
        c = _commercial(st, z, cls)
        gross = c["yield_pct"] if c else _p(st, "yields_prime_pct", country, cls)
    else:
        gross = _p(st, "city_yields", z["city"], "residential") or _p(st, "yields_prime_pct", country, "residential")
    if gross is None:
        return None, "", RAPPORT, None
    # Zone-variable gross yield: rents compress relative to price, so a pricier
    # freguesia yields less and a cheaper one more. gross_zone = gross × (ref/price)^0.4.
    ref = _city_price_median(st, z["city"], cls)
    price = _class_price(st, z, cls)
    if ref and price:
        gross = gross * (ref / price) ** 0.4
    det_tax = _p(st, "fiscalite", country, "detention_annual_pct", default=0.0) or 0.0
    charges = _p(st, "charges_pct", country, "detention", default=1.0)
    vac = _p(st, "charges_pct", country, "vacance", default=5.0)
    net = gross - det_tax - charges - gross * vac / 100.0
    # Per-freguesia split of the stack between charges and fiscalité (±1.5 pts of
    # rent, deterministic): effective IMI and condo charges vary locally, their
    # sum does not ; gross and net are strictly unchanged.
    delta = _split_jitter_pct(z["id"])
    det_tax_eff = det_tax + delta * gross / 100.0
    charges_eff = charges - delta * gross / 100.0
    # Inherit lowest confidence of the params consumed: gross yield + detention tax.
    conf = _derived_conf(_p(st, "_yields_conf", default=RAPPORT),
                         _p(st, "fiscalite", country, "det_conf", default=OFFICIEL))
    # Structured yield stack for the "Rendement" module (derived economics only).
    # charges_pct_loyer folds the vacancy loss in, so that
    # brut × (1 − charges_pct_loyer − fiscalite_pct_loyer) = net exactly.
    rent = price * gross / 100.0 if price else None
    charges_total = charges_eff + gross * vac / 100.0
    breakdown = {
        "loyer_marche_eur_m2_an": round(rent) if rent is not None else None,
        "yield_brut_pct": round(gross, 2),
        "charges_pct_loyer": round(charges_total / gross * 100.0, 1),
        "fiscalite_pct_loyer": round(det_tax_eff / gross * 100.0, 1),
        "yield_net_pct": round(net, 2),
    }
    return net, f"brut {gross:.2f}% − fisc {det_tax_eff:.2f} − charges {charges_eff:.2f} − vacance {vac:.0f}%", conf, breakdown


def _det_rendement(st: State, z: dict, cls: str) -> Pillar:
    net, detail, conf, breakdown = _net_yield_pct(st, z, cls)
    if net is None:
        return _np("rendement_net", "pas de yield paramétré pour la classe/pays")
    sub = _band(st, "yield_net_pct", net)
    return Pillar("rendement_net", sub, round(net, 2), "%",
                  f"yield net {net:.1f}%", f"rendement net {net:.2f}% ({detail})", conf,
                  breakdown=breakdown)


def _det_resilience(st: State, z: dict) -> Pillar:
    conn, conf = _zone_attr(st, z, "connectivite")
    if conn is None:
        return _np("resilience", "connectivité/qualité locative non paramétrée")
    vac = _p(st, "charges_pct", z["country"], "vacance", default=5.0)
    raw = 0.65 * float(conn) + 0.35 * max(0, 100 - vac * 6)
    sub = _percentile(st, "resilience", raw)
    return Pillar("resilience", sub, round(raw), "/100",
                  f"résilience {raw:.0f}", f"résilience locative {raw:.0f}/100 (connectivité {conn}, vacance {vac:.0f}%)", conf)


def _det_energie(st: State, z: dict) -> Pillar:
    meps = _p(st, "energy_meps", z["country"])
    if not meps:
        return _np("risque_energie", "MEPS non paramétré")
    risk = meps.get("risk_0_100", 50)
    sub = 100 - risk
    return Pillar("risque_energie", sub, risk, "/100 risque",
                  f"MEPS {meps.get('min_label')} {meps.get('deadline')}",
                  f"risque énergie {risk}/100 (min {meps.get('min_label')} d'ici {meps.get('deadline')})",
                  meps.get("confidence", OFFICIEL))


def _det_fiscalite(st: State, z: dict) -> Pillar:
    fisc = _p(st, "fiscalite", z["country"])
    if not fisc:
        return _np("fiscalite", "fiscalité non paramétrée")
    burden = fisc.get("acquisition_pct", 0) + (fisc.get("detention_annual_pct") or 0) * 10
    sub = max(0.0, min(100.0, 100 - burden * 3))
    return Pillar("fiscalite", sub, round(burden, 1), "/burden",
                  f"acq {fisc.get('acquisition_pct'):.1f}% + détention {fisc.get('detention_annual_pct')}%/an",
                  f"charge fiscale détention (droits {fisc.get('acquisition_pct'):.1f}%, "
                  f"annuel {fisc.get('detention_annual_pct')}%)", fisc.get("acq_conf", OFFICIEL))


def _portage(st: State, z: dict) -> Pillar:
    wacc = _p(st, "wacc_pct", z["country"])
    if wacc is None:
        return _np("portage", "coût de portage non paramétré")
    sub = max(0.0, min(100.0, 100 - (wacc - 2.0) * 12))
    return Pillar("portage", sub, wacc, "%", f"WACC {wacc}%",
                  f"coût de portage {wacc}%/an (dette senior + fonds propres, LTV cible)", RAPPORT)


# --------------------------------------------------------------------------- #
# ARBITRAGE pillars                                                           #
# --------------------------------------------------------------------------- #

def _arb_breakdown(st: State, z: dict, market: float | None, realizable: float | None,
                   spread: float) -> dict:
    """Structured disposal economics for the "Arbitrage" module (derived only).
    Realism bounds: selling costs 2-4% of value, disposal time 2-9 months ;
    both driven by market liquidity (deep park sells faster and cheaper), the
    negotiation discount grows with the expected time on market."""
    months = _absorption_months(st, z["id"])
    n = z["residential"].get("n_transactions")
    liq = _percentile(st, "liquidite", float(n)) if n else 50.0
    delai = min(9.0, max(2.0, months * (3.0 - 2.0 * liq / 100.0))) if months else None
    frais = min(4.0, max(2.0, 4.0 - 2.0 * liq / 100.0 + 0.2 * _split_jitter_pct(z["id"])))
    decote = min(6.0, max(1.5, 0.8 * delai)) if delai is not None else None
    return {
        "prix_marche_eur_m2": round(market) if market is not None else None,
        "valeur_realisable_eur_m2": round(realizable) if realizable is not None else None,
        "spread_pct": round(spread, 1),
        "delai_cession_mois": round(delai, 1) if delai is not None else None,
        "frais_cession_pct": round(frais, 1),
        "decote_negociation_pct": round(decote, 1) if decote is not None else None,
    }


def _arb_spread(st: State, z: dict, cls: str, asset: dict | None) -> Pillar:
    med = z["residential"].get("median_eur_m2")
    market: float | None = None      # reference price the spread is measured against
    realizable: float | None = None  # value a disposal can fetch (market × (1+spread))
    if asset and asset.get("spread_pct") is not None:
        spread = float(asset["spread_pct"])
        why = f"spread actif {spread:.0f}% (paramètre KREST)"
        conf = _derived_conf(asset.get("confidence", RAPPORT))
        if med:
            market, realizable = float(med), float(med) * (1 + spread / 100.0)
    else:
        zp = _zone_param(st, z["id"])
        comp = zp.get("comparables_eur_m2")
        if comp and med:
            spread = (comp / med - 1) * 100
            why = f"spread zone {spread:.0f}% (médiane {med:.0f} vs comparable {comp:.0f} €/m²)"
            conf = _derived_conf(zp.get("comparables_eur_m2_conf", RAPPORT),
                                 z["residential"].get("confidence", DERIVE))
            market, realizable = float(med), float(comp)
        else:
            q = (z["residential"].get("_internal") or {}).get("total_price_quantiles", {})
            q50, q75 = q.get("q50"), q.get("q75")
            if q50 and q75:
                spread = (q75 / q50 - 1) * 100
                why = f"spread {spread:.0f}% (potentiel haut de gamme, dispersion Q75/Q50)"
                conf = _derived_conf(z["residential"].get("confidence", DERIVE))
                if med:
                    market, realizable = float(med), float(med) * (1 + spread / 100.0)
            else:
                # Positioning spread: zone class price vs the city median price.
                price = _class_price(st, z, cls)
                ref = _city_price_median(st, z["city"], cls)
                if not price or not ref:
                    return _np("spread", "pas de référence pour un spread")
                spread = (price / ref - 1) * 100
                why = f"spread {spread:+.0f}% (positionnement vs médiane ville)"
                conf = DERIVE
                market, realizable = float(ref), float(price)
    sub = _band(st, "spread_pct", spread)
    return Pillar("spread", sub, round(spread, 1), "%", f"spread {spread:.0f}%", why, conf,
                  breakdown=_arb_breakdown(st, z, market, realizable, spread))


def _arb_appetit(st: State, cls: str) -> Pillar:
    app = _p(st, "institutional_appetite", cls)
    if app is None:
        return _np("appetit_institutionnel", f"appétit institutionnel non paramétré pour {cls}")
    sub = float(app) * 100
    return Pillar("appetit_institutionnel", sub, round(float(app), 2), "0-1",
                  f"appétit {app}", f"appétit institutionnel {cls} {app}", RAPPORT)


def _arb_momentum_cycle(st: State, z: dict) -> Pillar:
    yoy = z["residential"].get("yoy_pct")
    cycle, cconf = _zone_attr(st, z, "cycle_momentum")
    if yoy is None and cycle is None:
        return _np("momentum_cycle", "ni variation homologue ni momentum de cycle disponibles")
    peak = _p(st, "scoring", "cycle_peak_yoy_pct", default=10.0)
    parts, why = [], []
    if yoy is not None:
        # non-monotone: best near the cycle peak; penalise overheated AND declining
        parts.append(max(5.0, 95.0 - abs(yoy - peak) * 3.5))
        why.append(f"yoy {yoy:+.1f}% vs pic ~{peak:.0f}%")
    if cycle is not None:
        parts.append(float(cycle))
        why.append(f"momentum cycle paramétré {cycle}/100")
    sub = sum(parts) / len(parts)
    native = yoy if yoy is not None else cycle
    conf = DERIVE if yoy is not None else cconf
    return Pillar("momentum_cycle", sub, round(native, 1), "%" if yoy is not None else "/100",
                  f"yoy {yoy:+.1f}%" if yoy is not None else f"cycle {cycle}",
                  "cycle (courbe non monotone): " + ", ".join(why), conf)


def _arb_frictions(st: State, z: dict) -> Pillar:
    fisc = _p(st, "fiscalite", z["country"]) or {}
    exit_tax = fisc.get("exit_cgt_pct")
    if exit_tax is None:
        return _np("frictions_sortie", "fiscalité de sortie non paramétrée")
    sub = max(0.0, min(100.0, 100 - exit_tax * 2.2))
    return Pillar("frictions_sortie", sub, exit_tax, "%", f"sortie {exit_tax}%",
                  f"frictions de sortie: plus-value/friction {exit_tax}%", fisc.get("exit_conf", OFFICIEL))


def _cout_opportunite(st: State, z: dict) -> Pillar:
    coc = _p(st, "cost_of_capital_pct", z["country"])
    if coc is None:
        return _np("cout_opportunite", "coût du capital non paramétré")
    sub = max(0.0, min(100.0, 100 - (coc - 2.0) * 12))
    return Pillar("cout_opportunite", sub, coc, "%", f"CoC {coc}%",
                  f"coût d'opportunité du capital {coc}%", RAPPORT)


# --------------------------------------------------------------------------- #
# LANDBANK pillars                                                            #
# --------------------------------------------------------------------------- #

_LAND_USAGES = ("residential", "office", "hotel", "logistics", "retail")
_LAND_NORMATIVE_MARGIN = 0.15   # marge promoteur normative de la valeur résiduelle


def _land_usage_econ(st: State, z: dict, cls: str) -> tuple[float, float, float] | None:
    """(sale, build, land) : the promotion economics of one usage of the zone's
    land: realizable sale price, construction cost, and the land market price
    the promotion module uses for that usage."""
    price = _class_price(st, z, cls)
    build = _class_construction(st, z, cls)
    if not price or not build:
        return None
    if cls == "residential":
        sale = price * (1 + _new_build_premium(st, z) / 100.0)
        land = _land_cost_eur_m2(st, z)
    else:
        sale = price
        land = _commercial_land(st, cls, z["id"], sale)
    if land <= 0:
        return None
    return sale, build, land


def _land_constructibilite(st: State, z: dict) -> Pillar:
    p = _promo_constructibilite(st, z)   # same metric, reused
    if not p.applicable:
        return p
    # Residual land value per usage: what a developer can pay for the plot at a
    # normative 15% margin : sale / (1,15 × pile de coûts) − construction,
    # compared with the promotion land market. Realism bounds: uplift clamped
    # to [-40, +80]% and the displayed residual reconciled with it (never
    # negative, since land floors at 40 €/m²).
    stack = 1 + _p(st, "global", "dev_cost_stack_pct", default=18.0) / 100.0 \
        + (_p(st, "global", "ltv_max_pct", default=60.0) / 100.0) \
        * (_p(st, "global", "senior_debt_rate_pct", default=4.5) / 100.0) \
        * _p(st, "global", "promotion_build_years", default=3)
    denom = (1 + _LAND_NORMATIVE_MARGIN) * stack
    usages: dict[str, dict] = {}
    best: dict | None = None
    for cls in _LAND_USAGES:
        eco = _land_usage_econ(st, z, cls)
        if not eco:
            continue
        sale, build, land = eco
        raw = sale / denom - build
        uplift = max(-40.0, min(80.0, (raw / land - 1) * 100.0))
        entry = {
            "label": _CLS_FR.get(cls, cls),
            "prix_realisable_eur_m2": round(sale),
            "foncier_marche_eur_m2": round(land),
            "valeur_residuelle_eur_m2": round(land * (1 + uplift / 100.0)),
            "uplift_pct": round(uplift, 1),
        }
        usages[cls] = entry
        if best is None or entry["uplift_pct"] > best["uplift_pct"]:
            best = entry
    if best is None:
        return p
    p.breakdown = {
        "constructibilite": p.native_value,
        "meilleur_usage": best["label"],
        "prix_realisable_meilleur_usage_eur_m2": best["prix_realisable_eur_m2"],
        "foncier_marche_eur_m2": best["foncier_marche_eur_m2"],
        "valeur_residuelle_eur_m2": best["valeur_residuelle_eur_m2"],
        "uplift_pct": best["uplift_pct"],
        "usages": usages,
        # horizon_activation is injected by score_mode (it depends on the verdict)
    }
    return p


# Display names for the asset class in French (labels only; keys stay canonical).
_CLS_FR = {"residential": "résidentiel", "office": "bureaux", "hotel": "hôtel",
           "logistics": "logistique", "retail": "commerce", "living": "résidentiel"}


def _land_best_use(st: State, z: dict) -> Pillar:
    val, cls = _best_use_value(st, z)
    if val is None:
        return _np("valeur_meilleur_usage", "pas de valeur €/m² pour simuler le meilleur usage (BE)")
    sub = _percentile(st, "best_use_value", float(val))
    zp = _zone_param(st, z["id"])
    base_conf = zp.get("comparables_eur_m2_conf") if zp.get("comparables_eur_m2") \
        else z["residential"].get("confidence", DERIVE)
    conf = _derived_conf(base_conf)
    cls_fr = _CLS_FR.get(cls, cls)
    return Pillar("valeur_meilleur_usage", sub, val, "€/m²",
                  f"meilleur usage {cls_fr} {val} €/m²",
                  f"valeur meilleur usage: {cls_fr} ~{val} €/m² (max multi-usages)", conf)


def _land_connectivite(st: State, z: dict) -> Pillar:
    val, conf = _zone_attr(st, z, "connectivite")
    if val is None:
        return _np("connectivite", "connectivité non paramétrée")
    sub = _percentile(st, "connectivite", float(val))
    return Pillar("connectivite", sub, val, "/100", f"connectivité {val}",
                  f"connectivité {val}/100 (percentile socle)", conf)


def _land_incitations(st: State, z: dict) -> Pillar:
    inc = _p(st, "incentives_2026", z["country"])
    if not inc:
        return _np("incitations", "incitations 2026 non paramétrées")
    sub = float(inc.get("score_0_100", 50))
    return Pillar("incitations", sub, sub, "/100",
                  f"incitations {sub:.0f}", "incitations 2026: " + ", ".join(inc.get("labels", [])),
                  inc.get("confidence", RAPPORT))


def _land_timing(st: State, z: dict) -> Pillar:
    risk, conf = _zone_attr(st, z, "overlays_risk_0_100")
    if risk is None:
        return _np("risque_timing", "overlays/risque timing non paramétrés")
    sub = 100 - float(risk)
    return Pillar("risque_timing", sub, risk, "/100 risque",
                  f"risque timing {risk}", f"risque de timing réglementaire {risk}/100", conf)


# --------------------------------------------------------------------------- #
# Orchestration                                                               #
# --------------------------------------------------------------------------- #

_PILLAR_FUNCS = {
    "promotion": lambda st, z, cls, a: [
        _promo_marge(st, z, cls, a), _promo_absorption(st, z), _promo_momentum(st, z),
        _promo_constructibilite(st, z), _risque_sortie(st, z)],
    "detention": lambda st, z, cls, a: [
        _det_rendement(st, z, cls), _det_profondeur(st, z), _det_resilience(st, z),
        _det_energie(st, z), _det_fiscalite(st, z), _portage(st, z)],
    "arbitrage": lambda st, z, cls, a: [
        _arb_spread(st, z, cls, a), _arb_appetit(st, cls), _arb_momentum_cycle(st, z),
        _arb_frictions(st, z), _cout_opportunite(st, z)],
    "landbank": lambda st, z, cls, a: [
        _land_constructibilite(st, z), _land_best_use(st, z), _land_connectivite(st, z),
        _land_incitations(st, z), _land_timing(st, z)],
}


def _effective_weights(st: State, mode: str, z: dict, cls: str) -> tuple[dict, list]:
    weights = dict(st.params["scoring"]["weights"][mode])
    applied = []
    city_tag = st.params.get("city_tags", {}).get(z["city"]) or _zone_param(st, z["id"]).get("class_tag")
    for adj in st.params["scoring"].get("adjustments", []):
        if mode not in adj.get("modes", []):
            continue
        when = adj.get("when", {})
        ok = True
        if "city_tag" in when and when["city_tag"] != city_tag:
            ok = False
        if "class" in when and when["class"] != cls:
            ok = False
        if "city" in when and when["city"] != z["city"]:
            ok = False
        if ok:
            for pillar, factor in adj.get("multipliers", {}).items():
                if pillar in weights:
                    weights[pillar] *= factor
            for pillar, delta in adj.get("deltas", {}).items():
                if pillar in weights:
                    weights[pillar] += delta
            applied.append(adj.get("why", ""))
    return weights, applied


def _verdict(st: State, mode: str, total: float) -> str:
    ladder = st.params["scoring"]["verdicts"][mode]
    for v in ladder:
        if total >= v["min"]:
            return v["label"]
    return ladder[-1]["label"]


def _promotion_verdict_cap(st: State, verdict: str, marge: "Pillar | None") -> str:
    """Guardrail on the promotion verdict by developer margin: a losing deal caps
    at 'Passer', a thin margin (0 <= marge < 8%) caps at the middle verdict : a
    strong location can't rescue economics that don't pencil."""
    if marge is None or not marge.applicable or not isinstance(marge.native_value, (int, float)):
        return verdict
    m = marge.native_value
    ladder = [v["label"] for v in st.params["scoring"]["verdicts"]["promotion"]]  # best -> worst
    rank = {lab: i for i, lab in enumerate(ladder)}

    def cap(v: str, max_label: str) -> str:
        return max_label if rank.get(v, 0) < rank.get(max_label, len(ladder) - 1) else v

    if m < 0:
        return cap(verdict, ladder[-1])   # Passer
    if m < 8:
        return cap(verdict, ladder[1])    # Conditionnel (middle)
    return verdict


def _confidence_index(st: State, pillars: list[Pillar]) -> dict:
    applicable = [p for p in pillars if p.applicable]
    if not applicable:
        return {"score": 0.0, "level": "indicatif", "detail": "aucun pilier applicable"}
    supported = [p for p in applicable if p.confidence in _SUPPORTED]
    score = len(supported) / len(applicable)
    dci = st.params["scoring"]["data_confidence_index"]
    labels = dci.get("labels", {"eleve": "eleve", "moyen": "moyen", "bas": "indicatif"})
    level = labels["bas"]
    if score >= dci.get("eleve", 0.66):
        level = labels["eleve"]
    elif score >= dci.get("moyen", 0.40):
        level = labels["moyen"]
    return {"score": round(score, 2), "level": level,
            "detail": f"{len(supported)}/{len(applicable)} piliers en donnée officielle/rapport/dérivée"}


def _appetit_qual(value) -> str | None:
    """Institutional appetite as a graded word (mirrors the front's insight)."""
    if not isinstance(value, (int, float)):
        return None
    v = float(value)
    return "appétit soutenu" if v >= 0.7 else ("appétit modéré" if v >= 0.4 else "appétit faible")


def _native_indicator(mode: str, pillars: dict) -> dict:
    def lab(k):
        p = pillars.get(k)
        return p.native_label if p and p.applicable else None

    ap = pillars.get("appetit_institutionnel")
    appetit = _appetit_qual(ap.native_value) if ap and ap.applicable else None
    parts = {
        "promotion": [lab("marge"), lab("absorption")],
        "detention": [lab("rendement_net"), lab("risque_energie")],
        "arbitrage": [lab("spread"), appetit],
        "landbank": [lab("constructibilite"), lab("valeur_meilleur_usage")],
    }[mode]
    # Never surface an empty / "n/a" segment.
    kept = [p for p in parts if p and p != "n/a"]
    return {"label": " · ".join(kept) if kept else "–"}


def score_mode(zone_id: str, mode: str, asset_class: str | None = None,
               asset_name: str | None = None, city: str | None = None) -> dict:
    st = load(city)
    if mode not in MODES:
        raise ValueError(f"unknown mode {mode!r}; expected one of {MODES}")
    z = st.zones.get(zone_id)
    if z is None and cities.witness_city_names():
        # zones témoins historiques (ixelles, parquedasnacoes…) : rétrocompat
        wst = load(cities.WITNESS_SLUG)
        if zone_id in wst.zones:
            st, z = wst, wst.zones[zone_id]
    if z is None:
        raise KeyError(f"unknown zone {zone_id!r}")

    asset = None
    if asset_name:
        asset = st.params.get("krest_assets", {}).get(asset_name.lower())
        if asset is None:
            raise KeyError(f"unknown KREST asset {asset_name!r}")
    cls = asset_class or (asset or {}).get("class") \
        or _zone_param(st, zone_id).get("class_hint") or "residential"

    pillars = _PILLAR_FUNCS[mode](st, z, cls, asset)
    weights, adjustments = _effective_weights(st, mode, z, cls)

    # Reweight over APPLICABLE pillars only (drop non-pertinent, renormalise).
    applicable = [p for p in pillars if p.applicable]
    wsum = sum(weights.get(p.key, 0) for p in applicable)
    total = 0.0
    for p in pillars:
        w = weights.get(p.key, 0)
        p.weight = (w / wsum) if (wsum and p.applicable) else 0.0
        if p.applicable:
            total += p.subscore * p.weight

    by_key = {p.key: p for p in pillars}
    verdict = _verdict(st, mode, total)
    if mode == "promotion":
        verdict = _promotion_verdict_cap(st, verdict, by_key.get("marge"))
    if mode == "landbank":
        # Activation horizon: verdict-driven, refined by demand (rotation),
        # a priority reserve on a fast market activates immediately.
        cp = by_key.get("constructibilite")
        if cp is not None and cp.breakdown is not None:
            ladder = [v["label"] for v in st.params["scoring"]["verdicts"]["landbank"]]
            months = _absorption_months(st, zone_id)
            if verdict == ladder[0]:
                cp.breakdown["horizon_activation"] = "immédiat" if months and months <= 3.0 else "2-4 ans"
            elif verdict == ladder[1]:
                cp.breakdown["horizon_activation"] = "2-4 ans"
            else:
                cp.breakdown["horizon_activation"] = "au-delà"
    return {
        "zone": zone_id, "zone_name": z["name"], "city": z["city"],
        "country": z["country"], "level": z["level"], "mode": mode,
        "asset_class": cls, "asset": asset_name,
        "median_eur_m2": z["residential"].get("median_eur_m2"),
        "price_eur_m2": _class_price(st, z, cls),
        "yoy_pct": z["residential"].get("yoy_pct"),
        "n_transactions": z["residential"].get("n_transactions"),
        "total": round(total, 1),
        "verdict": verdict,
        "native_indicator": _native_indicator(mode, by_key),
        "data_confidence_index": _confidence_index(st, pillars),
        "pillars": [p.to_dict() for p in pillars],
        "weights_adjustments": adjustments,
        "krest": z.get("krest"),
    }


def score_all_modes(zone_id: str, asset_class: str | None = None,
                    asset_name: str | None = None, city: str | None = None) -> dict:
    return {m: score_mode(zone_id, m, asset_class, asset_name, city=city) for m in MODES}


def score_city(city: str, mode: str, asset_class: str | None = None) -> list[dict]:
    st = load(city)
    out = []
    for zid, z in st.zones.items():
        if z["city"] != city:
            continue
        try:
            out.append(score_mode(zid, mode, asset_class, city=city))
        except Exception as exc:  # noqa: BLE001
            log.warning("scoring failed for %s/%s: %s", city, zid, exc)
    out.sort(key=lambda r: r["total"], reverse=True)
    return out


def score_asset(asset_name: str, city: str | None = None) -> dict:
    st = load(city)
    asset = st.params.get("krest_assets", {}).get(asset_name.lower())
    if asset is None and cities.witness_city_names():
        wst = load(cities.WITNESS_SLUG)
        asset = wst.params.get("krest_assets", {}).get(asset_name.lower())
        if asset is not None:
            st = wst
    zone_id = asset["zone"]
    scores = {m: score_mode(zone_id, m, asset.get("class"), asset_name, city=city) for m in MODES}
    return {
        "asset": asset.get("name", asset_name), "city": asset.get("city"),
        "zone": zone_id, "class": asset.get("class"),
        "primary_mode": asset.get("primary_mode"),
        "scores": scores,
        "primary": scores.get(asset.get("primary_mode")),
    }
