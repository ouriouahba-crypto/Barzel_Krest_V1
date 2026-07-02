"""Shared helpers for the Barzel data collectors.

Everything here is intentionally dependency-light (only ``requests`` +
stdlib) so the collectors stay easy to run in CI or a cron job.

Design goals:
  * idempotent writes  -> atomic replace, so a crashed run never leaves a
    half-written CSV/JSON behind;
  * resilient network  -> a shared session with retry/back-off on the
    transient HTTP + connection errors;
  * observable         -> one logger, one format, every download logged
    with URL, status, byte count and elapsed time.
"""

from __future__ import annotations

import csv
import json
import logging
import os
import tempfile
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence

import requests
from requests.adapters import HTTPAdapter

try:  # urllib3 is a hard dependency of requests, but the import path moved.
    from urllib3.util.retry import Retry
except Exception:  # pragma: no cover - extremely defensive
    from requests.packages.urllib3.util.retry import Retry  # type: ignore


# --------------------------------------------------------------------------- #
# Paths                                                                        #
# --------------------------------------------------------------------------- #

# repo_root/backend/data/collect/utils.py -> repo_root
REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
BACKBONE_SCHEMA = REPO_ROOT / "barzel_data_backbone_v0.json"
BACKBONE_OUT = DATA_DIR / "backbone.json"


def ensure_dirs() -> None:
    """Create the data directories if they do not exist (idempotent)."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)


# --------------------------------------------------------------------------- #
# Logging                                                                      #
# --------------------------------------------------------------------------- #

def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%S%z",
            )
        )
        logger.addHandler(handler)
        logger.setLevel(os.environ.get("BARZEL_LOG_LEVEL", "INFO").upper())
    return logger


# --------------------------------------------------------------------------- #
# Time helpers                                                                 #
# --------------------------------------------------------------------------- #

def utc_now_iso() -> str:
    """UTC timestamp, second precision, e.g. 2026-07-01T12:00:00+00:00."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def today_iso() -> str:
    return date.today().isoformat()


# --------------------------------------------------------------------------- #
# HTTP                                                                         #
# --------------------------------------------------------------------------- #

DEFAULT_TIMEOUT = (10, 60)  # (connect, read) seconds
USER_AGENT = (
    "barzel-analytics-collector/0.1 (+https://example.org/barzel; "
    "official open-data collector; contact=data@barzel.example)"
)


def build_session(total_retries: int = 5, backoff_factor: float = 1.0) -> requests.Session:
    """A ``requests`` session that retries transient failures with back-off."""
    session = requests.Session()
    retry = Retry(
        total=total_retries,
        connect=total_retries,
        read=total_retries,
        status=total_retries,
        backoff_factor=backoff_factor,
        status_forcelist=(408, 429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET", "HEAD"]),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update({"User-Agent": USER_AGENT})
    return session


@dataclass
class Download:
    url: str
    status: int
    content: bytes
    elapsed_s: float
    from_cache: bool = False

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300

    def text(self, encoding: str = "utf-8") -> str:
        return self.content.decode(encoding, errors="replace")

    def json(self) -> Any:
        return json.loads(self.content.decode("utf-8"))


def download(
    session: requests.Session,
    url: str,
    logger: logging.Logger,
    *,
    params: dict[str, Any] | None = None,
    cache_path: Path | None = None,
    force: bool = False,
    timeout: tuple[int, int] = DEFAULT_TIMEOUT,
) -> Download:
    """GET ``url`` with logging + optional on-disk cache for idempotency.

    If ``cache_path`` exists and ``force`` is False, the cached bytes are
    returned without a network round-trip. This makes re-running a collector
    cheap and keeps a run reproducible offline once the raw payload is on disk.

    Raises ``requests.RequestException`` (already retried) on network failure,
    or ``RuntimeError`` on a non-2xx final status, so callers can decide
    whether to mark a zone ``a_collecter`` rather than fabricate a value.
    """
    if cache_path and cache_path.exists() and not force:
        content = cache_path.read_bytes()
        logger.info("CACHE  %s (%d bytes) <- %s", url, len(content), cache_path.name)
        return Download(url=url, status=200, content=content, elapsed_s=0.0, from_cache=True)

    started = time.monotonic()
    resp = session.get(url, params=params, timeout=timeout)
    elapsed = time.monotonic() - started
    logger.info(
        "GET    %s -> %s (%d bytes, %.2fs)",
        resp.url,
        resp.status_code,
        len(resp.content),
        elapsed,
    )
    if not (200 <= resp.status_code < 300):
        raise RuntimeError(f"HTTP {resp.status_code} for {resp.url}")

    if cache_path is not None:
        atomic_write_bytes(cache_path, resp.content)
        logger.info("CACHED %s -> %s", resp.url, cache_path.name)

    return Download(
        url=resp.url,
        status=resp.status_code,
        content=resp.content,
        elapsed_s=elapsed,
    )


# --------------------------------------------------------------------------- #
# Atomic / idempotent writes                                                   #
# --------------------------------------------------------------------------- #

def atomic_write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def atomic_write_text(path: Path, text: str) -> None:
    atomic_write_bytes(path, text.encode("utf-8"))


def write_json(path: Path, obj: Any) -> None:
    atomic_write_text(path, json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


def write_csv(path: Path, fieldnames: Sequence[str], rows: Iterable[dict[str, Any]]) -> int:
    """Write ``rows`` to a CSV atomically. Returns the number of rows written.

    Sorting the rows (by the ordered fieldnames) makes the output stable
    across runs, so an unchanged dataset produces a byte-identical file.
    """
    materialised = list(rows)
    materialised.sort(key=lambda r: tuple(str(r.get(f, "")) for f in fieldnames))
    from io import StringIO

    buf = StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(fieldnames), extrasaction="ignore")
    writer.writeheader()
    for row in materialised:
        writer.writerow(row)
    atomic_write_text(path, buf.getvalue())
    return len(materialised)
