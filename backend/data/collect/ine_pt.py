"""Collector 1/2 — Portugal / INE.

Downloads "Valor mediano das vendas de alojamentos familiares (€/m2)" from
Statistics Portugal's open JSON API (Base de Dados), for the requested
freguesias (Lisboa, and ALL freguesias of V.N. Gaia) and municípios (Loulé,
Alcochete).

Indicators (confirmed live):
  * 0012234 — median €/m2, TOTAL dwellings (Dim3=H1)
  * 0012235 — median €/m2, APARTMENTS
  * 0012231 — split by buyer fiscal domicile (national vs foreign)
  * INE_INDICATOR_NSALES (optional) — number of dwellings sold (n transactions)

Enrichments:
  * n_transactions — joined from the number-of-sales indicator when configured
    (confidence officiel); left empty otherwise (never fabricated).
  * yoy_pct — computed from the same quarter one year earlier (t vs t-4),
    confidence derive; unless an official homologous series is configured.

Output: data/raw/ine_pt.csv — one row per target geography.

Run:  python -m backend.data.collect.ine_pt  [--force]
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from typing import Any

import requests

from . import config as C
from .utils import (
    get_logger,
    build_session,
    download,
    ensure_dirs,
    write_csv,
    today_iso,
    utc_now_iso,
)

log = get_logger("collect.ine_pt")

CSV_FIELDS = (
    "city",
    "zone_id",
    "zone_name",
    "level",
    "geo_code",
    "as_of",
    "median_eur_m2_total",
    "median_eur_m2_apartments",
    "median_eur_m2_national",
    "median_eur_m2_foreign",
    "median_eur_m2_total_prev",
    "as_of_prev",
    "n_transactions",
    "n_source",
    "yoy_pct",
    "yoy_confidence",
    "status",
    "confidence",
    "source",
    "source_url",
    "collected_at",
)

_PREFIXES = (
    "uniao das freguesias de ",
    "uniao de freguesias de ",
    "freguesia de ",
    "freguesia da ",
)


def _norm(text: Any) -> str:
    if text is None:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(text))
    ascii_only = "".join(c for c in nfkd if not unicodedata.combining(c))
    out = " ".join(ascii_only.lower().replace("-", " ").split())
    for pref in _PREFIXES:
        if out.startswith(pref):
            out = out[len(pref):]
            break
    return out


def _slug(text: str) -> str:
    return _norm(text).replace(" ", "")


def _value(cell: dict | None) -> float | None:
    if not cell:
        return None
    raw = cell.get("valor")
    if raw in (None, "", "x", "-", "n.d.", "nd"):
        return None
    try:
        return float(str(raw).replace(",", "."))
    except ValueError:
        return None


def _fmt(v: float | None) -> str:
    if v is None:
        return ""
    return str(int(v)) if float(v).is_integer() else f"{v:.2f}"


# --------------------------------------------------------------------------- #
# INE API                                                                     #
# --------------------------------------------------------------------------- #

def _first(payload: Any) -> dict | None:
    if isinstance(payload, list) and payload:
        return payload[0]
    if isinstance(payload, dict):
        return payload
    return None


def latest_period(session: requests.Session, varcd: str, *, force: bool) -> tuple[str, str] | None:
    """Return (Dim1 code, human as_of) for the indicator's most recent quarter."""
    cache = C.CACHE_DIR / f"ine_meta_{varcd}.json"
    dl = download(session, C.INE_META_ENDPOINT, log,
                  params={"varcd": varcd, "lang": C.INE_LANG},
                  cache_path=cache, force=force)
    meta = _first(dl.json())
    if not meta:
        return None
    return _parse_period(meta.get("UltimoPeriodo") or "", varcd)


def _parse_period(label: str, varcd: str) -> tuple[str, str] | None:
    m = re.search(r"(\d)\D*Trimestre\D*(\d{4})", label)
    if not m:
        log.error("INE %s: cannot parse period from %r", varcd, label)
        return None
    quarter, year = m.group(1), m.group(2)
    return f"S5A{year}{quarter}", f"{year}-Q{quarter}"


def _prev_year_period(period_code: str) -> tuple[str, str] | None:
    """S5A{YYYY}{Q} -> same quarter, previous year (t-4)."""
    m = re.match(r"S5A(\d{4})(\d)$", period_code)
    if not m:
        return None
    year, quarter = int(m.group(1)) - 1, m.group(2)
    return f"S5A{year}{quarter}", f"{year}-Q{quarter}"


def fetch_all_geo(session: requests.Session, varcd: str, period_code: str,
                  *, dim3: str | None = None, force: bool) -> tuple[dict[str, dict], str]:
    """Fetch one indicator for ALL geographies at ``period_code`` -> {geocod: cell}."""
    params = {"op": "2", "varcd": varcd, "Dim1": period_code, "lang": C.INE_LANG}
    if dim3:
        params["Dim3"] = dim3
    tag = f"{varcd}_{period_code}" + (f"_{dim3}" if dim3 else "")
    cache = C.CACHE_DIR / f"ine_{tag}.json"
    dl = download(session, C.INE_DATA_ENDPOINT, log, params=params, cache_path=cache, force=force)
    obj = _first(dl.json())
    cells: dict[str, dict] = {}
    if obj and isinstance(obj.get("Dados"), dict):
        for _period, rows in obj["Dados"].items():
            for cell in rows or []:
                if isinstance(cell, dict):
                    cells[cell.get("geocod", "")] = cell
    return cells, dl.url


def _match(target: C.IneTarget, cells: dict[str, dict]) -> dict | None:
    if target.geo_code and target.geo_code in cells:
        return cells[target.geo_code]
    prefix = C.INE_FREGUESIA_PREFIX.get(target.city, "") if target.level == "freguesia" else ""
    wanted = {_norm(target.name), *[_norm(a) for a in target.aliases]}
    for geocod, cell in cells.items():
        if prefix and not geocod.startswith(prefix):
            continue
        if _norm(cell.get("geodsg")) in wanted:
            return cell
    return None


def _harvest_targets(total_cells: dict[str, dict]) -> list[C.IneTarget]:
    """Build freguesia targets for every parish under a harvested prefix."""
    dyn: list[C.IneTarget] = []
    pinned = {t.geo_code for t in C.INE_TARGETS if t.geo_code}
    explicit = {(t.city, _norm(t.name)) for t in C.INE_TARGETS}
    for city, prefix in C.INE_HARVEST_FREGUESIAS.items():
        for geocod, cell in total_cells.items():
            if not geocod.startswith(prefix) or len(geocod) <= len(prefix):
                continue
            if geocod in pinned:
                continue
            name = cell.get("geodsg") or geocod
            if (city, _norm(name)) in explicit:
                continue
            dyn.append(C.IneTarget(city, name, "freguesia", geo_code=geocod))
    if dyn:
        log.info("harvested %d freguesias under %s", len(dyn), C.INE_HARVEST_FREGUESIAS)
    return dyn


# --------------------------------------------------------------------------- #
# Collection                                                                   #
# --------------------------------------------------------------------------- #

def _empty_row(t: C.IneTarget, reason: str) -> dict:
    log.warning("a_collecter: %s (%s) — %s", t.name, t.level, reason)
    return {
        "city": t.city, "zone_id": _slug(t.name), "zone_name": t.name,
        "level": t.level, "geo_code": t.geo_code, "as_of": "",
        "median_eur_m2_total": "", "median_eur_m2_apartments": "",
        "median_eur_m2_national": "", "median_eur_m2_foreign": "",
        "median_eur_m2_total_prev": "", "as_of_prev": "",
        "n_transactions": "", "n_source": "", "yoy_pct": "", "yoy_confidence": "",
        "status": C.STATUS_TODO, "confidence": C.CONF_A_COLLECTER,
        "source": C.SRC_INE, "source_url": "", "collected_at": utc_now_iso(),
    }


def collect(force: bool = False) -> list[dict]:
    ensure_dirs()
    C.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    session = build_session()
    rows: list[dict] = []

    try:
        period = latest_period(session, C.INE_INDICATOR_TOTAL, force=force)
        if not period:
            raise RuntimeError("could not resolve latest INE period")
        period_code, as_of = period
        log.info("INE latest period: %s (%s)", as_of, period_code)

        total_cells, total_url = fetch_all_geo(
            session, C.INE_INDICATOR_TOTAL, period_code, dim3=C.INE_CAT_TOTAL, force=force)
        apt_cells, _ = fetch_all_geo(
            session, C.INE_INDICATOR_APARTMENTS, period_code, force=force)
    except (requests.RequestException, RuntimeError, ValueError) as exc:
        log.error("INE fetch failed (%s). Writing all targets a_collecter.", exc)
        rows = [_empty_row(t, f"fetch error: {exc}") for t in C.INE_TARGETS]
        write_csv(C.INE_RAW_CSV, CSV_FIELDS, rows)
        return rows

    # Optional: previous-year totals (t-4) for a derived YoY.
    prev_cells: dict[str, dict] = {}
    prev_as_of = ""
    if C.INE_YOY_FROM_TMINUS4:
        prev = _prev_year_period(period_code)
        if prev:
            prev_code, prev_as_of = prev
            try:
                prev_cells, _ = fetch_all_geo(
                    session, C.INE_INDICATOR_TOTAL, prev_code, dim3=C.INE_CAT_TOTAL, force=force)
            except (requests.RequestException, ValueError) as exc:
                log.warning("YoY unavailable — t-4 fetch failed (%s)", exc)

    # Optional: number of dwellings sold (transaction count).
    nsales_cells: dict[str, dict] = {}
    if C.INE_INDICATOR_NSALES:
        try:
            nsales_cells, _ = fetch_all_geo(
                session, C.INE_INDICATOR_NSALES, period_code, force=force)
        except (requests.RequestException, ValueError) as exc:
            log.warning("n_transactions unavailable — n-sales fetch failed (%s)", exc)
    else:
        log.info("INE_INDICATOR_NSALES not set — n_transactions left empty (not fabricated).")

    # Buyer fiscal-domicile split — fetched once per distinct fiscal geo.
    fiscal_cache: dict[str, dict[str, float | None]] = {}

    def fiscal_split(geo: str) -> dict[str, float | None]:
        if geo in fiscal_cache:
            return fiscal_cache[geo]
        result: dict[str, float | None] = {"national": None, "foreign": None}
        try:
            for cat, key in ((C.INE_FISCAL_NATIONAL, "national"),
                             (C.INE_FISCAL_FOREIGN, "foreign")):
                cells, _ = fetch_all_geo(session, C.INE_INDICATOR_FISCAL, period_code,
                                         dim3=cat, force=force)
                result[key] = _value(cells.get(geo))
        except (requests.RequestException, ValueError) as exc:
            log.warning("fiscal-domicile split unavailable for %s (%s)", geo, exc)
        fiscal_cache[geo] = result
        return result

    targets = list(C.INE_TARGETS) + _harvest_targets(total_cells)

    for t in targets:
        total_cell = _match(t, total_cells)
        apt_cell = _match(t, apt_cells)
        total_v = _value(total_cell)
        apt_v = _value(apt_cell)
        if total_v is None and apt_v is None:
            rows.append(_empty_row(t, "geography absent from latest INE response"))
            continue

        geo_code = t.geo_code or (total_cell or apt_cell or {}).get("geocod", "")

        # n transactions (official) from the n-sales indicator, joined by geocode.
        n_tx = _value(nsales_cells.get(geo_code)) if nsales_cells else None
        n_source = C.INE_INDICATOR_NSALES if n_tx is not None else ""

        # YoY (derived) from t vs t-4 on the total median.
        yoy = ""
        yoy_conf = ""
        prev_v = _value(prev_cells.get(geo_code)) if prev_cells else None
        if total_v is not None and prev_v not in (None, 0):
            yoy = f"{(total_v - prev_v) / prev_v * 100:.1f}"
            yoy_conf = C.CONF_DERIVE

        nat = foreign = None
        if t.fiscal_geo:
            split = fiscal_split(t.fiscal_geo)
            nat, foreign = split["national"], split["foreign"]

        rows.append({
            "city": t.city, "zone_id": _slug(t.name), "zone_name": t.name,
            "level": t.level, "geo_code": geo_code, "as_of": as_of,
            "median_eur_m2_total": _fmt(total_v),
            "median_eur_m2_apartments": _fmt(apt_v),
            "median_eur_m2_national": _fmt(nat),
            "median_eur_m2_foreign": _fmt(foreign),
            "median_eur_m2_total_prev": _fmt(prev_v),
            "as_of_prev": prev_as_of if prev_v is not None else "",
            "n_transactions": _fmt(n_tx),
            "n_source": n_source,
            "yoy_pct": yoy,
            "yoy_confidence": yoy_conf,
            "status": C.STATUS_REAL, "confidence": C.CONF_OFFICIEL,
            "source": C.SRC_INE, "source_url": total_url,
            "collected_at": utc_now_iso(),
        })
        log.info("collected %s (%s): total=%s apt=%s n=%s yoy=%s",
                 t.name, geo_code, total_v, apt_v, n_tx, yoy or "-")

    n = write_csv(C.INE_RAW_CSV, CSV_FIELDS, rows)
    log.info("wrote %d rows -> %s", n, C.INE_RAW_CSV)
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Collect INE PT local house prices.")
    parser.add_argument("--force", action="store_true", help="ignore the on-disk cache")
    args = parser.parse_args(argv)
    log.info("=== INE PT collection start (%s) ===", today_iso())
    try:
        collect(force=args.force)
    except Exception as exc:  # noqa: BLE001
        log.exception("INE collection crashed: %s", exc)
        return 1
    log.info("=== INE PT collection done ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
