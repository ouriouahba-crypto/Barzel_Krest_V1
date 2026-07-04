"""Collector 2/2 : Belgium / Statbel.

Downloads Statbel's open cadastral real-estate datasets and keeps the
requested Belgian geographies:
  * per statistical sector (NIS9)  : file ``TF_IMMO_SECTOR``
  * per commune (NIS5)             : file ``vastgoed_2010_9999``

For every (geography, property type) it captures: number of transactions,
price quantiles (P10/Q25/Q50/Q75/P90, whichever the release publishes), and,
when the file exposes total price AND total surface, a DERIVED eur/m2.

Filter: communes of the Brussels-Capital Region (NIS5 prefix 21) plus
Mont-Saint-Guibert (25068), at both commune and sector granularity.

Output: data/raw/statbel_be.csv.

Honesty contract:
  * Statbel serves these files behind a JS bot-challenge; a plain GET can return
    an HTML page instead of the ZIP. We detect that and DO NOT parse garbage ;
    the affected targets are written a_collecter with a clear log line.
  * eur/m2 is only emitted when total price AND total surface are present. The
    current sector file has neither, so its rows carry the published price
    quantiles (confidence=officiel), not a fabricated eur/m2.
  * A (geo, type) with < STATBEL_MIN_TRANSACTIONS is written a_collecter.

Run:  python -m backend.data.collect.statbel_be  [--force]
"""

from __future__ import annotations

import argparse
import csv
import io
import sys
import unicodedata
import zipfile
from typing import Iterable

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

log = get_logger("collect.statbel_be")

CSV_FIELDS = (
    "city",
    "zone_id",
    "zone_name",
    "level",            # commune | secteur_statistique
    "nis5",
    "nis9",
    "property_type",
    "as_of",
    "n_transactions",
    "total_price_eur",
    "total_surface_m2",
    "eur_m2_derived",
    "median_total_eur",
    "p10",
    "q25",
    "q50",
    "q75",
    "p90",
    "quantiles_basis",  # what the quantile numbers measure
    "status",
    "confidence",       # officiel (published) or derive (eur/m2)
    "source",
    "source_url",
    "collected_at",
)


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #

def _norm(text: str) -> str:
    if text is None:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(text))
    ascii_only = "".join(c for c in nfkd if not unicodedata.combining(c))
    return " ".join(ascii_only.lower().replace("-", " ").split())


def _slug(text: str) -> str:
    return _norm(text).replace(" ", "")


def _is_zip(content: bytes) -> bool:
    return content[:4] == b"PK\x03\x04"


def _looks_like_html(content: bytes) -> bool:
    head = content[:512].lstrip().lower()
    return head.startswith(b"<!doctype") or head.startswith(b"<html") or b"<title>" in head


def _resolve_col(header: list[str], candidates: tuple[str, ...]) -> str | None:
    lut = {h.strip().lower(): h for h in header}
    for cand in candidates:
        if cand in header:
            return cand
        if cand.strip().lower() in lut:
            return lut[cand.strip().lower()]
    return None


def _num(raw: str | None) -> float | None:
    if raw is None:
        return None
    s = str(raw).strip().replace(" ", "").replace(" ", "")
    if s in ("", "..", ".", "-", "NA", "na", "NULL", "null", "x"):
        return None
    # Statbel opendata uses a dot decimal; guard against a stray comma decimal.
    if s.count(",") == 1 and s.count(".") == 0:
        s = s.replace(",", ".")
    else:
        s = s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def _is_residential(type_label: str) -> bool:
    t = _norm(type_label)
    if any(bad in t for bad in ("terrain", "grond", "bati", "batir", "bureau",
                                "commerc", "industr", "garage", "agricol")):
        return False
    return any(good in t for good in ("maison", "appartement", "apartment",
                                      "villa", "huis", "flat", "woning",
                                      "habitation"))


def _fmt(v: float | None) -> str:
    if v is None:
        return ""
    if float(v).is_integer():
        return str(int(v))
    return f"{v:.2f}"


# --------------------------------------------------------------------------- #
# Download + extract                                                           #
# --------------------------------------------------------------------------- #

def _fetch_table(session: requests.Session, url: str, cache_name: str, *, force: bool
                 ) -> tuple[list[dict], str] | None:
    """Download a Statbel ZIP, extract the inner delimited text, parse to dicts.

    Returns (rows, resolved_url) or None if the download did not yield a real
    data file (bot-challenge HTML, empty, unparseable).
    """
    if not url:
        return None
    cache = C.CACHE_DIR / cache_name
    try:
        dl = download(session, url, log, cache_path=cache, force=force)
    except (requests.RequestException, RuntimeError) as exc:
        log.error("Statbel download failed for %s (%s)", url, exc)
        return None

    content = dl.content
    if _looks_like_html(content) or not _is_zip(content):
        log.error(
            "Statbel %s did not return a ZIP (looks like an HTML bot-challenge "
            "or unexpected payload, %d bytes). Cannot parse; leaving targets "
            "a_collecter. Download the file in a browser or via an env override.",
            url, len(content),
        )
        # Drop the poisoned cache so a later run can retry cleanly.
        try:
            cache.unlink(missing_ok=True)
        except OSError:
            pass
        return None

    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as exc:
        log.error("Statbel %s: bad ZIP (%s)", url, exc)
        return None

    members = [n for n in zf.namelist() if n.lower().endswith((".txt", ".csv"))]
    if not members:
        log.error("Statbel %s: no .txt/.csv inside ZIP (%s)", url, zf.namelist())
        return None

    raw = zf.read(members[0])
    text = _decode(raw)
    delimiter = C.STATBEL_DELIMITER or _sniff_delimiter(text)
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    rows = list(reader)
    log.info("Statbel %s: parsed %d rows from %s (delimiter=%r)",
             url, len(rows), members[0], delimiter)
    return rows, dl.url


def _sniff_delimiter(text: str) -> str:
    first = text.splitlines()[0] if text else ""
    counts = {d: first.count(d) for d in ("|", "\t", ";", ",")}
    best = max(counts, key=counts.get)
    return best if counts[best] > 0 else "|"


def _decode(raw: bytes) -> str:
    """Statbel opendata is cp1252; try the configured/utf-8 first, then cp1252."""
    encodings = [C.STATBEL_ENCODING] if C.STATBEL_ENCODING else ["utf-8", "cp1252"]
    for enc in encodings:
        try:
            return raw.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    return raw.decode("cp1252", errors="replace")


# --------------------------------------------------------------------------- #
# Row shaping                                                                  #
# --------------------------------------------------------------------------- #

def _shape_rows(raw_rows: list[dict], url: str, level: str, keep_below: bool) -> list[dict]:
    """Turn Statbel rows into backbone-oriented rows, latest year, residential.

    ``keep_below`` : when True, a below-threshold target is still emitted as an
    a_collecter row (used for commune-level targets so they stay visible). When
    False (sector level), thin sectors are skipped and only counted in the log,
    so the CSV is not flooded with hundreds of empty micro-sectors.
    """
    if not raw_rows:
        return []
    header = list(raw_rows[0].keys())

    col = {k: _resolve_col(header, v) for k, v in C.STATBEL_COLUMNS.items()}
    geo_col = col["nis9"] if level == "secteur_statistique" else col["nis5"]
    if geo_col is None:
        geo_col = col["nis9"] or col["nis5"]
    if geo_col is None or col["property_type"] is None or col["period_year"] is None:
        log.error("Statbel %s: missing key columns (geo/type/year) in %s", url, header)
        return []

    def _passes_grain(r: dict) -> bool:
        # Keep only annual, all-surface aggregate rows when those dims exist.
        if col["period_part"]:
            part = str(r.get(col["period_part"]) or "").strip()
            if part not in C.STATBEL_PERIOD_ANNUAL:
                return False
        if col["surface_class"]:
            sc = _norm(r.get(col["surface_class"]) or "")
            if sc not in {_norm(x) for x in C.STATBEL_SURFACE_TOTAL}:
                return False
        return True

    grained = [r for r in raw_rows if _passes_grain(r)]
    # Latest published year *among annual rows* (a partial current year that has
    # only quarterly rows is therefore ignored).
    years = {_num(r.get(col["period_year"])) for r in grained}
    years.discard(None)
    if not years:
        log.error("Statbel %s: no usable annual %s values", url, col["period_year"])
        return []
    latest = max(years)
    skipped_thin = 0
    log.info("Statbel %s: latest annual year=%s, shaping level=%s", url, int(latest), level)

    out: list[dict] = []
    for r in grained:
        if _num(r.get(col["period_year"])) != latest:
            continue
        type_label = (r.get(col["property_type"]) or "").strip()
        if not _is_residential(type_label):
            continue

        geo_raw = str(r.get(geo_col) or "").strip()
        if not geo_raw:
            continue
        # Exclude region/arrondissement aggregates (refnis level != commune, or
        # NIS codes ending 000). We only want actual communes / sectors.
        if level == "commune":
            if col["refnis_level"] and str(r.get(col["refnis_level"]) or "").strip() not in ("5", ""):
                continue
            if geo_raw.endswith("000"):
                continue
        nis5 = geo_raw[:5]
        nis9 = geo_raw if level == "secteur_statistique" else ""
        city = C.city_slug_for_nis(nis5)
        if city is None:
            continue  # not a target commune

        n_tx = _num(r.get(col["n_transactions"])) if col["n_transactions"] else None
        total_price = _num(r.get(col["total_price"])) if col["total_price"] else None
        total_surface = _num(r.get(col["total_surface"])) if col["total_surface"] else None
        q = {k: (_num(r.get(col[k])) if col[k] else None) for k in ("p10", "q25", "q50", "q75", "p90")}

        # Threshold gate : never publish a thin cell as a number.
        below = n_tx is not None and n_tx < C.STATBEL_MIN_TRANSACTIONS
        has_value = any(v is not None for v in q.values()) or total_price is not None
        if below or not has_value:
            if keep_below:
                out.append(_empty_row(city, geo_raw, nis5, nis9, level, type_label,
                                       int(latest), "below threshold" if below else "no value"))
            else:
                skipped_thin += 1
            continue

        eur_m2 = None
        confidence = C.CONF_OFFICIEL
        if total_price is not None and total_surface not in (None, 0):
            eur_m2 = total_price / total_surface
            confidence = C.CONF_DERIVE

        name = _commune_name(nis5, r, col) if level == "commune" else _sector_name(geo_raw, r, col)
        out.append(
            {
                "city": city,
                "zone_id": _slug(name) or geo_raw,
                "zone_name": name,
                "level": level,
                "nis5": nis5,
                "nis9": nis9,
                "property_type": type_label,
                "as_of": str(int(latest)),
                "n_transactions": _fmt(n_tx),
                "total_price_eur": _fmt(total_price),
                "total_surface_m2": _fmt(total_surface),
                "eur_m2_derived": _fmt(eur_m2),
                "median_total_eur": _fmt(q["q50"]),
                "p10": _fmt(q["p10"]),
                "q25": _fmt(q["q25"]),
                "q50": _fmt(q["q50"]),
                "q75": _fmt(q["q75"]),
                "p90": _fmt(q["p90"]),
                "quantiles_basis": "total_price_eur",
                "status": C.STATUS_REAL,
                "confidence": confidence,
                "source": C.SRC_STATBEL,
                "source_url": url,
                "collected_at": utc_now_iso(),
            }
        )
    if skipped_thin:
        log.info("Statbel %s: skipped %d thin/empty %s cells (< %d tx), not written",
                 url, skipped_thin, level, C.STATBEL_MIN_TRANSACTIONS)
    return out


def _commune_name(nis5: str, r: dict, col: dict) -> str:
    if col["commune_name"] and r.get(col["commune_name"]):
        return str(r[col["commune_name"]]).strip()
    for fb in C.STATBEL_FALLBACK_COMMUNES:
        if fb["nis"] == nis5:
            return fb["label"]
    return nis5


def _sector_name(nis9: str, r: dict, col: dict) -> str:
    if col["sector_name"] and r.get(col["sector_name"]):
        return str(r[col["sector_name"]]).strip()
    return nis9


def _empty_row(city: str, geo: str, nis5: str, nis9: str, level: str,
               type_label: str, period: int, reason: str) -> dict:
    log.warning("a_collecter: %s %s (%s) : %s", geo, type_label, level, reason)
    return {
        "city": city,
        "zone_id": _slug(geo) or geo,
        "zone_name": geo,
        "level": level,
        "nis5": nis5,
        "nis9": nis9,
        "property_type": type_label,
        "as_of": str(period),
        "n_transactions": "",
        "total_price_eur": "",
        "total_surface_m2": "",
        "eur_m2_derived": "",
        "median_total_eur": "",
        "p10": "", "q25": "", "q50": "", "q75": "", "p90": "",
        "quantiles_basis": "",
        "status": C.STATUS_TODO,
        "confidence": C.CONF_A_COLLECTER,
        "source": C.SRC_STATBEL,
        "source_url": "",
        "collected_at": utc_now_iso(),
    }


def _fallback_rows() -> list[dict]:
    """When nothing could be downloaded, still surface the target communes."""
    return [
        _empty_row(fb["city"], fb["label"], fb["nis"], "", "commune", "", 0,
                   "Statbel file unavailable (bot-challenge / network)")
        for fb in C.STATBEL_FALLBACK_COMMUNES
    ]


# --------------------------------------------------------------------------- #
# Entry                                                                        #
# --------------------------------------------------------------------------- #

def collect(force: bool = False) -> list[dict]:
    ensure_dirs()
    C.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    session = build_session()

    rows: list[dict] = []

    commune = _fetch_table(session, C.STATBEL_COMMUNE_URL, "statbel_commune.zip", force=force)
    if commune:
        rows.extend(_shape_rows(commune[0], commune[1], "commune", keep_below=True))

    sector = _fetch_table(session, C.STATBEL_SECTOR_URL, "statbel_sector.zip", force=force)
    if sector:
        rows.extend(_shape_rows(sector[0], sector[1], "secteur_statistique", keep_below=False))

    if not rows:
        log.error("No Statbel rows collected; writing fallback a_collecter set.")
        rows = _fallback_rows()

    n = write_csv(C.STATBEL_RAW_CSV, CSV_FIELDS, rows)
    log.info("wrote %d rows -> %s", n, C.STATBEL_RAW_CSV)
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Collect Statbel BE cadastral prices.")
    parser.add_argument("--force", action="store_true", help="ignore the on-disk cache")
    args = parser.parse_args(argv)
    log.info("=== Statbel BE collection start (%s) ===", today_iso())
    try:
        collect(force=args.force)
    except Exception as exc:  # noqa: BLE001
        log.exception("Statbel collection crashed: %s", exc)
        return 1
    log.info("=== Statbel BE collection done ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
