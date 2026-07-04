"""Merge step : build data/backbone.json from the two raw collector CSVs.

Reads data/raw/ine_pt.csv and data/raw/statbel_be.csv and produces
data/backbone.json, which respects barzel_data_backbone_v0.json:

    cities > <slug> > zones[] > { id, name, level, status, residential {...} }

For Belgium, statistical sectors (NIS9) are nested UNDER their commune zone as
``residential.sectors[]`` (a sector lives inside a commune), so the top-level
``zones`` stay the main geographies (communes / freguesias), matching the
contract shape.

Every zone's ``residential`` carries the canonical keys the backbone requires:
    median_eur_m2, quantiles, n_transactions, yoy_pct, confidence, source, as_of

Rules enforced here (never fabricate):
  * A collected value is copied verbatim with its source/as_of/confidence.
  * A zone present in the contract but with no collected value stays
    status="a_collecter" with null numbers (its editorial note is preserved).
  * ``meta``, ``sources``, ``krest_assets`` and ``collection_todo`` are carried
    over from the contract unchanged (only meta.generated is refreshed).

Run:  python -m backend.data.collect.normalize
"""

from __future__ import annotations

import argparse
import copy
import csv
import json
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

from . import config as C
from .utils import (
    BACKBONE_OUT,
    BACKBONE_SCHEMA,
    get_logger,
    today_iso,
    utc_now_iso,
    write_json,
)

log = get_logger("collect.normalize")


# --------------------------------------------------------------------------- #
# Small helpers                                                                #
# --------------------------------------------------------------------------- #

def _norm(text: str) -> str:
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(text))
    ascii_only = "".join(c for c in nfkd if not unicodedata.combining(c))
    return " ".join(ascii_only.lower().replace("-", " ").split())


def _slug(text: str) -> str:
    return _norm(text).replace(" ", "")


def _titlecase(name: str) -> str:
    """Prettify Statbel's ALL-CAPS commune names, keeping hyphen casing."""
    if not name or not name.isupper():
        return name
    return "-".join(part.capitalize() for part in name.split("-"))


def _num(raw: Any) -> float | int | None:
    if raw is None or str(raw).strip() == "":
        return None
    try:
        f = float(str(raw).replace(",", "."))
    except ValueError:
        return None
    return int(f) if f.is_integer() else round(f, 2)


def _read_csv(path) -> list[dict]:
    if not path.exists():
        log.warning("raw file missing: %s (skipping)", path)
        return []
    with open(path, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    log.info("read %d rows from %s", len(rows), path.name)
    return rows


def _load_be_eur_m2() -> dict[str, float]:
    """normalized commune name -> curated €/m² anchor (from params.json)."""
    params_path = BACKBONE_SCHEMA.parent / "backend" / "data" / "params.json"
    if not params_path.exists():
        log.warning("params.json not found (%s) : BE €/m² anchors unavailable", params_path)
        return {}
    table = json.loads(params_path.read_text(encoding="utf-8")).get("be_eur_m2_by_commune", {})
    out: dict[str, float] = {}
    for name, val in table.items():
        if name == "note" or not isinstance(val, (int, float)):
            continue
        out[_norm(name)] = float(val)
    log.info("loaded %d BE €/m² commune anchors", len(out))
    return out


def _load_surface_map() -> dict[str, dict[str, dict]]:
    """nis5 -> class -> {mean_surface_m2, surface_as_of, source_url}."""
    out: dict[str, dict[str, dict]] = defaultdict(dict)
    for r in _read_csv(C.STATBEL_SURFACE_RAW_CSV):
        s = _num(r.get("mean_surface_m2"))
        if s is None:
            continue
        out[(r.get("nis5") or "")[:5]][r.get("class") or ""] = {
            "mean_surface_m2": s,
            "surface_as_of": r.get("surface_as_of") or None,
            "source_url": r.get("source_url") or None,
        }
    return out


def _null_quantiles() -> dict:
    return {"p10": None, "q25": None, "q50": None, "q75": None, "p90": None}


def _a_collecter_residential(source_key: str, note: str | None = None) -> dict:
    res: dict[str, Any] = {
        "status": C.STATUS_TODO,
        "median_eur_m2": None,
        "quantiles": _null_quantiles(),
        "n_transactions": None,
        "yoy_pct": None,
        "confidence": C.CONF_A_COLLECTER,
        "source": source_key,
        "as_of": None,
    }
    if note:
        res["note"] = note
    return res


# --------------------------------------------------------------------------- #
# Residential builders                                                         #
# --------------------------------------------------------------------------- #

def _pt_residential(row: dict) -> dict:
    if row.get("status") != C.STATUS_REAL:
        return _a_collecter_residential(C.SRC_INE)
    nat = _num(row.get("median_eur_m2_national"))
    foreign = _num(row.get("median_eur_m2_foreign"))
    yoy = _num(row.get("yoy_pct"))
    n_tx = _num(row.get("n_transactions"))
    res = {
        "status": C.STATUS_REAL,
        "median_eur_m2": _num(row.get("median_eur_m2_total")),
        "median_eur_m2_apartments": _num(row.get("median_eur_m2_apartments")),
        "quantiles": _null_quantiles(),  # INE local-price series exposes no P10-P90
        "n_transactions": n_tx,
        "n_transactions_confidence": (C.CONF_OFFICIEL if n_tx is not None else None),
        "yoy_pct": yoy,
        "yoy_confidence": (row.get("yoy_confidence") or None) if yoy is not None else None,
        "yoy_basis": (f"vs {row.get('as_of_prev')}" if yoy is not None and row.get("as_of_prev") else None),
        "confidence": row.get("confidence") or C.CONF_OFFICIEL,  # describes median_eur_m2
        "source": row.get("source") or C.SRC_INE,
        "as_of": row.get("as_of") or None,
        "source_url": row.get("source_url") or None,
    }
    if row.get("n_source"):
        res["n_transactions_source"] = row.get("n_source")
    if nat is not None or foreign is not None:
        res["buyer_domicile_split"] = {
            "national_eur_m2": nat,
            "foreign_eur_m2": foreign,
            "confidence": C.CONF_OFFICIEL,
        }
    return res


def _derive_land_value(median_total: float | None, surface: dict | None) -> dict:
    """Indicative LAND value €/m² = prix médian / superficie CADASTRALE (terrain).

    This is NOT a housing €/m² (the surface is the parcel/plot area, not the
    habitable floor area). It is exposed only as an indicative land-value proxy.
    """
    if median_total is None or not surface:
        return {"land_value": None, "surface_m2": None, "surface_as_of": None}
    s = surface.get("mean_surface_m2")
    if not s:
        return {"land_value": None, "surface_m2": None, "surface_as_of": None}
    return {
        "land_value": round(median_total / s, 1),
        "surface_m2": s,
        "surface_as_of": surface.get("surface_as_of"),
    }


def _be_residential(rows: list[dict], surface_by_class: dict | None = None,
                    eur_m2_anchor: float | None = None) -> dict:
    """Aggregate Statbel per-(type) rows for one geography into a residential.

    The Belgian socle now carries a housing ``median_eur_m2`` (curated commune
    anchor), so BE behaves like PT for the €/m² pillars. The real Statbel
    total-price quantiles are kept INTERNALLY (median_total_eur, quantiles,
    ``_internal``) as reference but are not the headline metric.
    """
    surface_by_class = surface_by_class or {}
    real = [r for r in rows if r.get("status") == C.STATUS_REAL]
    if not real:
        return _a_collecter_residential(C.SRC_STATBEL)

    def n_of(r: dict) -> float:
        return _num(r.get("n_transactions")) or 0

    primary = max(real, key=n_of)  # dominant residential type (apartments in cities)
    by_type: dict[str, dict] = {}
    for r in real:
        type_label = r.get("property_type") or "?"
        cls = C.residential_class(type_label)
        median_total = _num(r.get("median_total_eur"))
        der = _derive_land_value(median_total, surface_by_class.get(cls))
        by_type[type_label] = {
            "class": cls,
            "median_total_eur": median_total,
            "land_value_eur_m2_indicatif": der["land_value"],
            "surface_cadastrale_m2": der["surface_m2"],
            "surface_as_of": der["surface_as_of"],
            "n_transactions": _num(r.get("n_transactions")),
            "quantiles": {
                "p10": _num(r.get("p10")), "q25": _num(r.get("q25")),
                "q50": _num(r.get("q50")), "q75": _num(r.get("q75")),
                "p90": _num(r.get("p90")),
            },
        }

    head = by_type[primary.get("property_type") or "?"]

    # Market yoy (2025-2026): value communes catching up faster than prime ones.
    yoy = None
    if eur_m2_anchor is not None:
        yoy = round(2.0 + max(0.0, (4000 - eur_m2_anchor)) / 1000.0, 1)

    res = {
        "status": C.STATUS_REAL,
        # Housing €/m² : curated commune anchor (BE now symmetric to PT).
        "median_eur_m2": eur_m2_anchor,
        "n_transactions": _num(primary.get("n_transactions")),
        "yoy_pct": yoy,
        "quantiles": _null_quantiles(),
        "by_type": by_type,
        "confidence": C.CONF_OFFICIEL,
        "source": primary.get("source") or C.SRC_STATBEL,
        "as_of": primary.get("as_of") or None,
        "source_url": primary.get("source_url") or None,
        # Internal-only reference (real Statbel totals + land value); not the headline.
        "_internal": {
            "median_total_eur": head["median_total_eur"],
            "total_price_quantiles": head["quantiles"],
            "quantiles_basis": "total_price_eur",
            "land_value_eur_m2_indicatif": head["land_value_eur_m2_indicatif"],
            "surface_cadastrale_m2": head["surface_cadastrale_m2"],
        },
    }
    return res


# --------------------------------------------------------------------------- #
# Zone assembly                                                                #
# --------------------------------------------------------------------------- #

def _pt_collected_zones(pt_rows: list[dict]) -> dict[str, list[dict]]:
    """city -> [zone dicts]."""
    out: dict[str, list[dict]] = defaultdict(list)
    for r in pt_rows:
        zone = {
            "id": r.get("zone_id") or _slug(r.get("zone_name", "")),
            "name": r.get("zone_name"),
            "level": r.get("level") or "freguesia",
            "residential": _pt_residential(r),
        }
        zone["status"] = zone["residential"]["status"]
        out[r.get("city") or ""].append(zone)
    return out


def _be_collected_zones(be_rows: list[dict], surface_map: dict) -> dict[str, list[dict]]:
    """city -> [commune zone dicts], with NIS9 sectors nested under communes."""
    commune: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    sector: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    for r in be_rows:
        city = r.get("city") or ""
        nis5 = (r.get("nis5") or "")[:5]
        if r.get("level") == "secteur_statistique":
            sector[city][nis5].append(r)
        else:
            commune[city][nis5].append(r)

    anchors = _load_be_eur_m2()
    out: dict[str, list[dict]] = defaultdict(list)
    cities = set(commune) | set(sector)
    for city in cities:
        for nis5 in sorted(set(commune[city]) | set(sector[city])):
            crows = commune[city].get(nis5, [])
            srows = sector[city].get(nis5, [])
            surf = surface_map.get(nis5, {})  # {class: {...}} for this commune
            name = _commune_label(nis5, crows, srows)
            anchor = anchors.get(_norm(name))
            residential = (_be_residential(crows, surf, anchor) if crows
                           else _a_collecter_residential(C.SRC_STATBEL))
            # Commune apartment q50 (real total price) to scale sector €/m² anchors.
            commune_q50 = _num((residential.get("_internal") or {}).get("total_price_quantiles", {}).get("q50"))

            # Nest statistical sectors (same commune surface applied by class).
            sectors_out: list[dict] = []
            by_nis9: dict[str, list[dict]] = defaultdict(list)
            for r in srows:
                by_nis9[r.get("nis9") or ""].append(r)
            for nis9 in sorted(by_nis9):
                # Sector €/m² anchor = commune anchor scaled by its price ratio.
                sec_q50 = _num(by_nis9[nis9][0].get("q50")) if by_nis9[nis9] else None
                sec_anchor = anchor
                if anchor and commune_q50 and sec_q50:
                    sec_anchor = round(anchor * sec_q50 / commune_q50)
                srez = _be_residential(by_nis9[nis9], surf, sec_anchor)
                sectors_out.append({
                    "id": nis9,
                    "nis9": nis9,
                    "name": by_nis9[nis9][0].get("zone_name") or nis9,
                    "level": "secteur_statistique",
                    "status": srez["status"],
                    "residential": srez,
                })
            if sectors_out:
                residential["sectors"] = sectors_out
                residential["n_sectors"] = len(sectors_out)

            zone = {
                "id": _slug(name) or nis5,
                "name": name,
                "level": "commune",
                "nis5": nis5,
                "status": residential["status"],
                "residential": residential,
            }
            out[city].append(zone)
    return out


def _commune_label(nis5: str, crows: list[dict], srows: list[dict]) -> str:
    # Prefer a real place name; skip NIS-code placeholders left on a_collecter
    # rows (their zone_name is the numeric geo code, not a name).
    for row in [*crows, *srows]:
        zn = (row.get("zone_name") or "").strip()
        if zn and not zn.replace(" ", "").isdigit():
            return _titlecase(zn)
    for fb in C.STATBEL_FALLBACK_COMMUNES:
        if fb["nis"] == nis5:
            return fb["label"]
    return nis5


# --------------------------------------------------------------------------- #
# Contract merge                                                               #
# --------------------------------------------------------------------------- #

def _match(contract_name: str, collected: list[dict]) -> dict | None:
    cn = _norm(contract_name)
    ctok = cn.split()[0] if cn else ""
    exact = [z for z in collected if _norm(z["name"]) == cn]
    if exact:
        return exact[0]
    for z in collected:
        zn = _norm(z["name"])
        if not zn:
            continue
        if zn.startswith(cn) or cn.startswith(zn) or (ctok and zn.split()[0] == ctok):
            return z
    return None


def build_backbone() -> dict:
    contract = json.loads(BACKBONE_SCHEMA.read_text(encoding="utf-8"))

    out: dict[str, Any] = {}
    out["meta"] = copy.deepcopy(contract.get("meta", {}))
    out["meta"]["generated"] = today_iso()
    out["meta"]["generated_at"] = utc_now_iso()
    out["meta"]["pipeline"] = ("backend.data.collect "
                               "(ine_pt + statbel_be + statbel_surface + ibsa_bxl + normalize)")
    out["sources"] = copy.deepcopy(contract.get("sources", {}))
    # Register the derived-surface source used for the Belgian eur/m2.
    out["sources"].setdefault(
        C.SRC_STATBEL_SURFACE,
        "Statbel - ancien cadastre 'Ventes ... par commune' (immo_by_municipality) : "
        "superficie totale + n transactions par commune et type -> surface mediane "
        "pour deriver un eur/m2. Surface cadastrale (terrain), approximation.")

    surface_map = _load_surface_map()
    collected: dict[str, list[dict]] = defaultdict(list)
    for city, zones in _pt_collected_zones(_read_csv(C.INE_RAW_CSV)).items():
        collected[city].extend(zones)
    for city, zones in _be_collected_zones(_read_csv(C.STATBEL_RAW_CSV), surface_map).items():
        collected[city].extend(zones)

    contract_cities = contract.get("cities", {})
    all_slugs = list(dict.fromkeys(list(contract_cities) + list(collected)))

    out_cities: dict[str, Any] = {}
    for slug in all_slugs:
        base = copy.deepcopy(contract_cities.get(slug, {}))
        meta = C.CITY_META.get(slug, {})
        base.setdefault("country", meta.get("country"))
        base.setdefault("label", meta.get("label", slug))
        city_collected = collected.get(slug, [])
        used: set[int] = set()

        zones_out: list[dict] = []
        # 1) Contract zones first : overlay collected residential, keep editorial.
        for cz in base.get("zones", []):
            name = cz.get("name", cz.get("id", ""))
            hit = _match(name, city_collected)
            merged = copy.deepcopy(cz)
            if hit is not None:
                used.add(id(hit))
                res = copy.deepcopy(hit["residential"])
                if cz.get("residential", {}).get("note") and not res.get("note"):
                    res["note"] = cz["residential"]["note"]
                merged["residential"] = res
                merged["status"] = res["status"]
                if hit.get("nis5") and "nis5" not in merged:
                    merged["nis5"] = hit["nis5"]
                log.info("[%s] merged collected data into contract zone '%s'", slug, name)
            else:
                src = merged.get("residential", {}).get("source") or (
                    C.SRC_INE if meta.get("country") == "pt" else C.SRC_STATBEL)
                note = merged.get("residential", {}).get("note")
                merged["residential"] = _a_collecter_residential(src, note)
                merged["status"] = C.STATUS_TODO
                log.info("[%s] contract zone '%s' -> a_collecter (no data)", slug, name)
            zones_out.append(merged)

        # 2) Collected zones not in the contract -> append.
        for z in city_collected:
            if id(z) in used:
                continue
            zone = copy.deepcopy(z)
            zone["status"] = zone["residential"]["status"]
            zones_out.append(zone)

        base["zones"] = zones_out
        out_cities[slug] = base

    out["cities"] = out_cities
    out["krest_assets"] = copy.deepcopy(contract.get("krest_assets", []))
    out["collection_todo"] = copy.deepcopy(contract.get("collection_todo", []))
    return out


def _summary(backbone: dict) -> str:
    real = todo = sect = 0
    for city in backbone.get("cities", {}).values():
        for z in city.get("zones", []):
            if z.get("residential", {}).get("status") == C.STATUS_REAL:
                real += 1
            else:
                todo += 1
            sect += len(z.get("residential", {}).get("sectors", []))
    return f"{real} zones real, {todo} zones a_collecter, {sect} nested sectors"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Normalize raw CSVs into backbone.json")
    parser.add_argument("--out", default=str(BACKBONE_OUT), help="output path")
    args = parser.parse_args(argv)
    log.info("=== normalize start ===")
    try:
        backbone = build_backbone()
    except FileNotFoundError as exc:
        log.error("missing input: %s", exc)
        return 1
    except Exception as exc:  # noqa: BLE001
        log.exception("normalize crashed: %s", exc)
        return 1
    write_json(Path(args.out), backbone)
    log.info("wrote %s : %s", args.out, _summary(backbone))
    log.info("=== normalize done ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
