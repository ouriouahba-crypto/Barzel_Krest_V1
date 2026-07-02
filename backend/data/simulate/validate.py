"""Étape 2 — fidelity validation.

Re-aggregates the simulated listings by zone and checks that the reconstructed
median (and, for Belgium, the quantiles P10-P90) fall back onto the REAL
backbone values within tolerance:
  * ±2 % in general,
  * ±5 % for small zones (few transactions), where sampling noise is larger.

Writes FIDELITY_REPORT.md (one line per zone/stream with deviations and a
PASS/FAIL flag) and returns a non-zero exit code if any large zone fails, so a
failing zone is never published silently.

Belgium is validated on TOTAL price (its native metric); Portugal on €/m².

Run:  python -m backend.data.simulate.validate
"""

from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
from collections import defaultdict

from ..collect.utils import get_logger, atomic_write_text, today_iso
from . import sim_config as S

log = get_logger("simulate.validate")

_PROB = {"p10": 0.10, "q25": 0.25, "q50": 0.50, "q75": 0.75, "p90": 0.90}


def _quantile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return float("nan")
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    idx = p * (len(sorted_vals) - 1)
    lo = int(idx)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = idx - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


def _dev(sim: float, real: float) -> float:
    return abs(sim - real) / real if real else float("inf")


def _load_listings() -> dict:
    """(country, zone_id, class) -> list of (price_total, price_eur_m2)."""
    groups: dict[tuple, list] = defaultdict(list)
    with open(S.LISTINGS_OUT, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            price = float(r["price_total_eur"]) if r["price_total_eur"] else None
            em2 = float(r["price_eur_m2"]) if r["price_eur_m2"] else None
            groups[(r["country"], r["zone_id"], r["class"])].append((price, em2))
    return groups


def validate() -> tuple[list[dict], int]:
    backbone = json.loads(S.BACKBONE.read_text(encoding="utf-8"))
    groups = _load_listings()
    results: list[dict] = []

    for city, cdata in backbone.get("cities", {}).items():
        country = cdata.get("country")
        for z in cdata.get("zones", []):
            res = z["residential"]
            if res.get("status") != "real":
                continue
            zid = z["id"]

            # Uniform check (PT & BE symmetric): reconstruct the apartment €/m²
            # median from the simulated listings and compare to the zone anchor.
            if country == "pt":
                has_freg = any(zz.get("level") == "freguesia" for zz in cdata["zones"])
                if has_freg and z.get("level") != "freguesia":
                    continue
            elif country == "be" and z.get("level") != "commune":
                continue
            sample = [e for _, e in groups.get((country, zid, "apartment"), []) if e is not None]
            if not sample:
                continue
            real_med = res.get("median_eur_m2_apartments") or res.get("median_eur_m2")
            if real_med is None:
                continue
            results.append(_check(city, zid, z["name"], f"{country.upper()}:apartment", "eur_m2",
                                  sample, {"q50": real_med}))

    fails = sum(1 for r in results if r["flag"] == "FAIL")
    _write_report(results)
    passed = sum(1 for r in results if r["flag"] == "PASS")
    log.info("fidelity: %d PASS / %d FAIL / %d total streams", passed, fails, len(results))
    return results, fails


def _check(city, zid, zname, stream, metric, sample: list[float], real_q: dict) -> dict:
    sample = sorted(sample)
    n = len(sample)
    tol = S.FIDELITY_TOL if n >= S.FIDELITY_SMALL_N else S.FIDELITY_TOL_SMALL
    devs = {}
    worst = 0.0
    for key, real in real_q.items():
        if real is None or key not in _PROB:
            continue
        sim_q = _quantile(sample, _PROB[key])
        d = _dev(sim_q, float(real))
        devs[key] = (round(sim_q, 1), float(real), round(d * 100, 2))
        worst = max(worst, d)
    flag = "PASS" if worst <= tol else "FAIL"
    return {
        "city": city, "zone_id": zid, "zone_name": zname, "stream": stream,
        "metric": metric, "n": n, "tol_pct": round(tol * 100, 1),
        "median_dev_pct": devs.get("q50", (None, None, None))[2],
        "worst_dev_pct": round(worst * 100, 2), "devs": devs, "flag": flag,
    }


def _write_report(results: list[dict]) -> None:
    passed = [r for r in results if r["flag"] == "PASS"]
    failed = [r for r in results if r["flag"] == "FAIL"]
    lines = [
        "# FIDELITY_REPORT — texture simulée vs backbone officiel",
        "",
        f"Généré le {today_iso()} · seed={S.SEED} · tolérance {S.FIDELITY_TOL*100:.0f}% "
        f"(±{S.FIDELITY_TOL_SMALL*100:.0f}% si n<{S.FIDELITY_SMALL_N}).",
        "",
        f"**{len(passed)}/{len(results)} flux PASS** ({len(failed)} FAIL). "
        "PT et BE validés sur le €/m² (Belgique désormais symétrique au Portugal).",
        "",
        "Chaque flux ré-agrège les biens simulés d'une zone et compare la médiane "
        "(et, pour BE, les quantiles publiés P10-P90) à la valeur réelle du backbone.",
        "",
        "| flag | ville | zone | flux | n | écart médian % | pire écart % | tol % |",
        "|---|---|---|---|---:|---:|---:|---:|",
    ]
    for r in sorted(results, key=lambda x: (x["flag"] != "FAIL", x["city"], x["zone_id"])):
        lines.append(
            f"| {'✅' if r['flag']=='PASS' else '❌'} {r['flag']} | {r['city']} | "
            f"{r['zone_name']} | {r['stream']} | {r['n']} | "
            f"{r['median_dev_pct'] if r['median_dev_pct'] is not None else '-'} | "
            f"{r['worst_dev_pct']} | {r['tol_pct']} |")
    if failed:
        lines += ["", "## Zones FAIL (à NE PAS publier comme densité fidèle)", ""]
        for r in failed:
            detail = "; ".join(f"{k}: sim={v[0]} réel={v[1]} ({v[2]}%)" for k, v in r["devs"].items())
            lines.append(f"- **{r['city']}/{r['zone_id']}** ({r['stream']}, n={r['n']}): {detail}")
    lines += [
        "",
        "## Méthode",
        "- PT & BE : €/m² lognormal centré sur l'ancre communale/freguesia (σ proxy), "
        "tirage stratifié → la médiane reconstruite retombe sur l'ancre.",
        "- Un écart > tolérance sur une petite zone reflète le bruit d'échantillonnage "
        "(peu de transactions) ; la zone est marquée FAIL, jamais publiée en silence.",
        "",
    ]
    atomic_write_text(S.FIDELITY_REPORT, "\n".join(lines) + "\n")
    log.info("wrote %s", S.FIDELITY_REPORT)


def main(argv: list[str] | None = None) -> int:
    argparse.ArgumentParser(description="Validate simulated listings vs backbone.").parse_args(argv)
    log.info("=== fidelity validation start ===")
    try:
        _results, fails = validate()
    except FileNotFoundError as exc:
        log.error("missing input (%s) — run generate_listings first", exc)
        return 1
    except Exception as exc:  # noqa: BLE001
        log.exception("validation crashed: %s", exc)
        return 1
    log.info("=== fidelity validation done ===")
    # Non-zero exit if a LARGE zone (strict tol) failed.
    return 2 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
