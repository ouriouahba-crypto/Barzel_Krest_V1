"""Collector 2b/2 : Belgium / IBSA (Bruxelles).

IBSA / opendata.brussels.be exposes NO open dataset with eur/m2, dwelling
surface, or rents by quartier/commune (the price figures it publishes are
Statbel/AGDP-derived; rents exist only as PDF observatory reports). The one
machine-readable, CC0 dataset is the Monitoring des Quartiers GEOGRAPHY,
i.e. the quartier ↔ commune mapping, which we ingest here as an enrichment.

Consequence, recorded honestly: Brussels eur/m2 is DERIVED from Statbel surface
(see statbel_surface.py), not taken from IBSA, because no official free source
publishes a quartier eur/m2.

Output: data/raw/ibsa_bxl.csv, one row per quartier (quartier, commune).

Run:  python -m backend.data.collect.ibsa_bxl  [--force]
"""

from __future__ import annotations

import argparse
import csv
import io
import sys

import requests

from . import config as C
from .utils import get_logger, build_session, download, ensure_dirs, write_csv, today_iso, utc_now_iso

log = get_logger("collect.ibsa_bxl")

CSV_FIELDS = ("quartier_id", "quartier_name", "commune_name", "source", "source_url", "collected_at")


def _export_url() -> str:
    return f"{C.IBSA_ODS_BASE}/{C.IBSA_QUARTIERS_DATASET}/exports/csv"


def collect(force: bool = False) -> list[dict]:
    ensure_dirs()
    C.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    session = build_session()

    url = _export_url()
    cache = C.CACHE_DIR / "ibsa_quartiers.csv"
    try:
        dl = download(session, url, log, params={"delimiter": ";", "use_labels": "false"},
                      cache_path=cache, force=force)
    except (requests.RequestException, RuntimeError) as exc:
        log.error("IBSA quartier download failed (%s). Writing empty file.", exc)
        write_csv(C.IBSA_RAW_CSV, CSV_FIELDS, [])
        return []

    text = dl.content.decode("utf-8", errors="replace")
    delim = ";" if text.splitlines()[0].count(";") >= text.splitlines()[0].count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
    fields = {f.lower(): f for f in (reader.fieldnames or [])}

    def pick(*cands: str) -> str | None:
        for c in cands:
            if c in fields:
                return fields[c]
        return None

    q_name = pick("namefre", "namedut", "name")
    commune = pick("nom_commune", "gemeentenaam", "commune")
    q_id = pick("mdzone", "inspire_id")
    if not (q_name and commune):
        log.error("IBSA dataset schema unexpected: %s", reader.fieldnames)
        write_csv(C.IBSA_RAW_CSV, CSV_FIELDS, [])
        return []

    rows = []
    for r in reader:
        name = (r.get(q_name) or "").strip()
        comm = (r.get(commune) or "").strip()
        if not name or not comm:
            continue
        rows.append({
            "quartier_id": (r.get(q_id) or "").strip() if q_id else "",
            "quartier_name": name,
            "commune_name": comm,
            "source": C.SRC_IBSA,
            "source_url": url,
            "collected_at": utc_now_iso(),
        })
    n = write_csv(C.IBSA_RAW_CSV, CSV_FIELDS, rows)
    log.info("wrote %d quartiers -> %s", n, C.IBSA_RAW_CSV)
    distinct = len({r["commune_name"] for r in rows})
    if distinct < 15:
        log.warning("IBSA quartier->commune field maps to only %d communes and is "
                    "known unreliable (mislabeled) ; kept as a raw artifact, NOT "
                    "injected into the backbone. A spatial join on geo_shape would "
                    "be needed for a trustworthy quartier->commune assignment.", distinct)
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Collect IBSA Brussels quartier geography.")
    parser.add_argument("--force", action="store_true", help="ignore the on-disk cache")
    args = parser.parse_args(argv)
    log.info("=== IBSA Bruxelles collection start (%s) ===", today_iso())
    try:
        collect(force=args.force)
    except Exception as exc:  # noqa: BLE001
        log.exception("IBSA collection crashed: %s", exc)
        return 1
    log.info("=== IBSA Bruxelles collection done ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
