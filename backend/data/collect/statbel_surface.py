"""Collector 1b/2 : Belgium / Statbel SURFACE (for the derived eur/m2).

The current Statbel transaction files (TF_IMMO_SECTOR, vastgoed_2010_9999)
publish price quantiles and transaction counts but NO surface, so eur/m2 is not
derivable from them. This module fetches a median dwelling surface per commune
and dwelling class from the OLDER cadastral commune file
(``immo_by_municipality``), which shipped MS_TOTAL_SURFACE + MS_TOTAL_TRANSACTIONS.

    mean_surface_m2(commune, class) = Σ MS_TOTAL_SURFACE / Σ MS_TOTAL_TRANSACTIONS

Surface is structurally stable, so the (older) surface year is recorded as
``surface_as_of`` and later applied to current prices in normalize.py.

Output: data/raw/statbel_surface.csv, one row per (commune, class ∈
{apartment, house}). No fabrication: a commune/class without a usable surface
cell is simply absent (normalize leaves its eur/m2 null → a_collecter).

Caveat (documented downstream): this is a CADASTRAL surface (plot-leaning for
houses), an approximation of dwelling size, not certified habitable area.

Run:  python -m backend.data.collect.statbel_surface  [--force]
"""

from __future__ import annotations

import argparse
import csv
import io
import sys
import zipfile
from collections import defaultdict

import requests

from . import config as C
from .utils import get_logger, build_session, download, ensure_dirs, write_csv, today_iso, utc_now_iso
from .statbel_be import _decode, _is_zip, _looks_like_html, _sniff_delimiter, _num, _norm, _resolve_col

log = get_logger("collect.statbel_surface")

CSV_FIELDS = (
    "nis5", "commune_name", "class", "mean_surface_m2", "n_transactions",
    "surface_as_of", "status", "source", "source_url", "collected_at",
)


def _fmt(v: float | None) -> str:
    if v is None:
        return ""
    return str(int(v)) if float(v).is_integer() else f"{v:.1f}"


def _fetch(session: requests.Session, force: bool) -> tuple[list[dict], str] | None:
    cache = C.CACHE_DIR / "statbel_surface.zip"
    try:
        dl = download(session, C.STATBEL_SURFACE_URL, log, cache_path=cache, force=force)
    except (requests.RequestException, RuntimeError) as exc:
        log.error("surface download failed (%s)", exc)
        return None
    content = dl.content
    if _looks_like_html(content) or not _is_zip(content):
        log.error("surface file was not a ZIP (bot-challenge/HTML, %d bytes). "
                  "Override STATBEL_SURFACE_URL or fetch via browser.", len(content))
        try:
            cache.unlink(missing_ok=True)
        except OSError:
            pass
        return None
    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as exc:
        log.error("surface ZIP bad (%s)", exc)
        return None
    members = [n for n in zf.namelist() if n.lower().endswith((".txt", ".csv"))]
    if not members:
        log.error("no .txt/.csv inside surface ZIP (%s)", zf.namelist())
        return None
    text = _decode(zf.read(members[0]))
    delim = C.STATBEL_DELIMITER or _sniff_delimiter(text)
    rows = list(csv.DictReader(io.StringIO(text), delimiter=delim))
    log.info("surface file: %d rows from %s (delim=%r)", len(rows), members[0], delim)
    return rows, dl.url


def collect(force: bool = False) -> list[dict]:
    ensure_dirs()
    C.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    session = build_session()

    fetched = _fetch(session, force)
    if not fetched:
        log.warning("no surface data; writing empty statbel_surface.csv")
        write_csv(C.STATBEL_SURFACE_RAW_CSV, CSV_FIELDS, [])
        return []
    raw_rows, url = fetched
    header = list(raw_rows[0].keys()) if raw_rows else []
    col = {k: _resolve_col(header, v) for k, v in C.STATBEL_SURFACE_COLUMNS.items()}
    if not (col["nis5"] and col["property_type"] and col["period_year"]
            and col["total_surface"] and col["n_transactions"]):
        log.error("surface file missing key columns: %s", header)
        write_csv(C.STATBEL_SURFACE_RAW_CSV, CSV_FIELDS, [])
        return []

    # (nis5, class, year) -> [sum_surface, sum_n, commune_name]
    agg: dict[tuple[str, str, int], list] = defaultdict(lambda: [0.0, 0.0, ""])
    for r in raw_rows:
        # annual, all-surface, commune-level only
        if col["period_part"] and str(r.get(col["period_part"]) or "").strip() not in C.STATBEL_PERIOD_ANNUAL:
            continue
        if col["surface_class"]:
            sc = _norm(r.get(col["surface_class"]) or "")
            if sc not in {_norm(x) for x in C.STATBEL_SURFACE_TOTAL}:
                continue
        if col["refnis_level"] and str(r.get(col["refnis_level"]) or "").strip() not in ("5", ""):
            continue
        nis5 = str(r.get(col["nis5"]) or "").strip()[:5]
        if not nis5 or nis5.endswith("000") or C.city_slug_for_nis(nis5) is None:
            continue
        cls = C.residential_class(r.get(col["property_type"]) or "")
        if not cls:
            continue
        year = _num(r.get(col["period_year"]))
        surface = _num(r.get(col["total_surface"]))
        n = _num(r.get(col["n_transactions"]))
        if year is None or surface is None or n in (None, 0):
            continue
        key = (nis5, cls, int(year))
        agg[key][0] += surface
        agg[key][1] += n
        if not agg[key][2] and col["commune_name"]:
            agg[key][2] = str(r.get(col["commune_name"]) or "").strip()

    # For each (nis5, class), pick the LATEST year meeting the min-tx threshold.
    best: dict[tuple[str, str], tuple[int, float, float, str]] = {}
    for (nis5, cls, year), (surf, n, name) in agg.items():
        if n < C.STATBEL_SURFACE_MIN_TX:
            continue
        cur = best.get((nis5, cls))
        if cur is None or year > cur[0]:
            best[(nis5, cls)] = (year, surf, n, name)

    rows = []
    for (nis5, cls), (year, surf, n, name) in best.items():
        rows.append({
            "nis5": nis5, "commune_name": name, "class": cls,
            "mean_surface_m2": _fmt(surf / n), "n_transactions": _fmt(n),
            "surface_as_of": str(year), "status": C.STATUS_REAL,
            "source": C.SRC_STATBEL_SURFACE, "source_url": url,
            "collected_at": utc_now_iso(),
        })
    classes = {r["class"] for r in rows}
    if "apartment" not in classes:
        log.info("note: apartments carry no cadastral parcel surface in this file "
                 "-> eur/m2 is derivable for houses only; apartment eur/m2 stays null.")
    n_written = write_csv(C.STATBEL_SURFACE_RAW_CSV, CSV_FIELDS, rows)
    log.info("wrote %d surface rows -> %s", n_written, C.STATBEL_SURFACE_RAW_CSV)
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Collect Statbel commune dwelling surface.")
    parser.add_argument("--force", action="store_true", help="ignore the on-disk cache")
    args = parser.parse_args(argv)
    log.info("=== Statbel surface collection start (%s) ===", today_iso())
    try:
        collect(force=args.force)
    except Exception as exc:  # noqa: BLE001
        log.exception("surface collection crashed: %s", exc)
        return 1
    log.info("=== Statbel surface collection done ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
