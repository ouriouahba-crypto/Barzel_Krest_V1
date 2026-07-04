"""One-shot driver: run both collectors, then normalize into backbone.json.

    python -m backend.data.collect.pipeline            # full run (uses cache)
    python -m backend.data.collect.pipeline --force    # re-download everything

Each stage is independent and idempotent; a failing collector does not abort the
others (it just yields a_collecter rows), and normalize always runs last so the
backbone reflects whatever was successfully collected.
"""

from __future__ import annotations

import argparse
import sys

from .utils import get_logger, today_iso
from . import ine_pt, statbel_be, statbel_surface, ibsa_bxl, normalize

log = get_logger("collect.pipeline")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the full Barzel collection pipeline.")
    parser.add_argument("--force", action="store_true", help="ignore caches, re-download")
    args = parser.parse_args(argv)

    log.info("######## Barzel collection pipeline (%s) ########", today_iso())
    rc = 0
    for name, fn in (("ine_pt", lambda: ine_pt.collect(force=args.force)),
                     ("statbel_be", lambda: statbel_be.collect(force=args.force)),
                     ("statbel_surface", lambda: statbel_surface.collect(force=args.force)),
                     ("ibsa_bxl", lambda: ibsa_bxl.collect(force=args.force))):
        try:
            fn()
        except Exception as exc:  # noqa: BLE001 ; a collector must not kill the run
            log.exception("collector %s failed: %s", name, exc)
            rc = 1

    if normalize.main([]) != 0:
        rc = 1
    log.info("######## pipeline done (rc=%d) ########", rc)
    return rc


if __name__ == "__main__":
    sys.exit(main())
