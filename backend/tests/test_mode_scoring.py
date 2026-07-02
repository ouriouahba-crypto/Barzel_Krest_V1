"""Tests for the mode-scoring engine. Run: python -m pytest backend/tests -q
(or `python backend/tests/test_mode_scoring.py` for a dependency-free smoke run).
"""

from __future__ import annotations

from backend.services import mode_scoring as ms

WITNESS = "santamarinhaesaopedrodaafurada"


def test_four_distinct_modes():
    scores = ms.score_all_modes(WITNESS)
    assert set(scores) == set(ms.MODES)
    for m, s in scores.items():
        assert 0 <= s["total"] <= 100
        assert s["verdict"]
        assert s["pillars"]


def test_haya_promotion_prime_111():
    a = ms.score_asset("haya")
    assert a["primary_mode"] == "promotion"
    marge = next(p for p in a["primary"]["pillars"] if p["pillar"] == "marge")
    assert "prime 111%" in marge["why"], marge["why"]


def test_belgium_is_symmetric_to_portugal():
    # Belgium now carries a housing €/m² anchor -> every pillar is applicable
    # (no "non pertinent ici") across all four modes for a Brussels commune.
    for m in ms.MODES:
        s = ms.score_mode("ixelles", m)
        assert all(p["applicable"] for p in s["pillars"]), (m, s["pillars"])
        applicable = [p for p in s["pillars"] if p["applicable"]]
        assert abs(sum(p["weight"] for p in applicable) - 1.0) < 5e-3


def test_confidence_index_levels():
    s = ms.score_mode(WITNESS, "detention")
    assert s["data_confidence_index"]["level"] in ("eleve", "moyen", "indicatif")


def test_city_ranking_sorted():
    rows = ms.score_city("gaia", "promotion")
    totals = [r["total"] for r in rows]
    assert totals == sorted(totals, reverse=True)


def test_promotion_verdict_cap_rule():
    # The cap function directly: negative margin -> worst verdict, thin margin
    # (0<=m<8%) -> at best the middle verdict, healthy margin untouched.
    st = ms.load()
    go, cond, passer = (v["label"] for v in st.params["scoring"]["verdicts"]["promotion"])

    def marge(m):
        return ms.Pillar("marge", 60.0, m, "%", "", "", ms.RAPPORT)

    assert ms._promotion_verdict_cap(st, go, marge(-3)) == passer
    assert ms._promotion_verdict_cap(st, cond, marge(-1)) == passer
    assert ms._promotion_verdict_cap(st, go, marge(4)) == cond
    assert ms._promotion_verdict_cap(st, cond, marge(4)) == cond
    assert ms._promotion_verdict_cap(st, go, marge(20)) == go        # healthy: untouched
    assert ms._promotion_verdict_cap(st, passer, marge(4)) == passer  # already worse: untouched
    assert ms._promotion_verdict_cap(st, go, None) == go              # no marge pillar: untouched


def test_promotion_city_verdicts_respect_margin():
    # End-to-end over Gaia: no 'Go' on a thin margin, always 'Passer' on a loss.
    rows = ms.score_city("gaia", "promotion")
    go, _, passer = (v["label"] for v in ms.load().params["scoring"]["verdicts"]["promotion"])
    seen_neg = seen_thin = False
    for r in rows:
        marge = next((p for p in r["pillars"] if p["pillar"] == "marge" and p["applicable"]), None)
        if not marge:
            continue
        m = marge["native"]["value"]
        if m < 0:
            seen_neg = True
            assert r["verdict"] == passer, (r["zone"], m, r["verdict"])
        elif m < 8:
            seen_thin = True
            assert r["verdict"] != go, (r["zone"], m, r["verdict"])
    assert seen_neg and seen_thin  # current Gaia calibration exercises both branches


def test_unknown_zone_and_mode_raise():
    import pytest
    with pytest.raises(KeyError):
        ms.score_mode("does-not-exist", "promotion")
    with pytest.raises(ValueError):
        ms.score_mode(WITNESS, "not-a-mode")


if __name__ == "__main__":  # dependency-free smoke run
    ms.load()
    test_four_distinct_modes()
    test_haya_promotion_prime_111()
    test_belgium_is_symmetric_to_portugal()
    test_confidence_index_levels()
    test_city_ranking_sorted()
    test_promotion_verdict_cap_rule()
    test_promotion_city_verdicts_respect_margin()
    print("OK — all smoke checks passed")
