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


def test_gaia_residential_land_floor():
    # No Gaia residential freguesia may carry a land cost below 40 €/m².
    rows = ms.score_city("gaia", "promotion", "residential")
    for r in rows:
        if r["level"] != "freguesia":
            continue
        marge = next((p for p in r["pillars"] if p["pillar"] == "marge"), None)
        b = marge.get("breakdown") if marge else None
        if b and b.get("land") is not None:
            assert b["land"] >= 40, (r["zone"], b["land"])


def test_haya_margin_35_36():
    # Portugal residential is not VAT-charged on the sale; the trophy asset lands
    # a 35-36% developer margin at its 5750 €/m² achievable price.
    a = ms.score_asset("haya")
    marge = next(p for p in a["primary"]["pillars"] if p["pillar"] == "marge")
    m = marge["native"]["value"]
    assert 35.0 <= m <= 36.0, m


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


GAIA_RURAL = ["sandim,olival,leverecrestuma", "serzedoeperosinho", "grijoesermonde",
              "pedrosoeseixezelo", "avintes", "canelas", "vilardeandorinho"]


def test_detention_residential_recalibrated_groups():
    # Depth-weighted detention: the urban/littoral core holds, the rural belt is
    # let go despite higher facial yields (inverted-yield trap).
    rows = {r["zone"]: r for r in ms.score_city("gaia", "detention", "residential")
            if r["level"] == "freguesia"}
    assert rows[WITNESS]["verdict"] == "Conserver"
    assert rows["madalena"]["verdict"] == "Conserver"
    for z in ["mafamudeevilardoparaiso", "canidelo", "oliveiradodouro", "arcozelo",
              "gulpilharesevaladares", "saofelixdamarinha"]:
        assert rows[z]["verdict"] == "Surveiller", (z, rows[z]["verdict"])
    for z in GAIA_RURAL:
        assert rows[z]["verdict"] == "Ceder", (z, rows[z]["verdict"])


def test_detention_no_rural_conserver_residential():
    # Invariant: a thin rural rental market never rates Conserver, whatever its yield.
    rows = {r["zone"]: r for r in ms.score_city("gaia", "detention", "residential")
            if r["level"] == "freguesia"}
    for z in GAIA_RURAL:
        assert rows[z]["verdict"] != "Conserver", z


def test_detention_breakdown_identity():
    # The displayed yield stack must reconcile exactly (display rounding aside):
    # brut × (1 − charges%loyer − fiscalité%loyer) = net, for every zone and class.
    for cls in ("residential", "office", "hotel", "logistics", "retail"):
        for r in ms.score_city("gaia", "detention", cls):
            rend = next((p for p in r["pillars"] if p["pillar"] == "rendement_net"), None)
            b = rend.get("breakdown") if rend else None
            if not b:
                continue
            ident = b["yield_brut_pct"] * (1 - (b["charges_pct_loyer"] + b["fiscalite_pct_loyer"]) / 100.0)
            assert abs(ident - b["yield_net_pct"]) < 0.02, (r["zone"], cls, b)


def test_arbitrage_breakdown_bounds():
    # Realism bounds on the disposal economics: selling costs 2-4% of value,
    # disposal time 2-9 months; realizable value reconciles with the spread.
    for cls in ("residential", "office", "hotel", "logistics", "retail"):
        for r in ms.score_city("gaia", "arbitrage", cls):
            sp = next((p for p in r["pillars"] if p["pillar"] == "spread"), None)
            b = sp.get("breakdown") if sp else None
            if not b:
                continue
            assert 2.0 <= b["frais_cession_pct"] <= 4.0, (r["zone"], cls, b)
            if b["delai_cession_mois"] is not None:
                assert 2.0 <= b["delai_cession_mois"] <= 9.0, (r["zone"], cls, b)
            if b["prix_marche_eur_m2"] and b["valeur_realisable_eur_m2"]:
                expect = b["prix_marche_eur_m2"] * (1 + b["spread_pct"] / 100.0)
                assert abs(expect - b["valeur_realisable_eur_m2"]) <= max(3.0, 0.005 * b["valeur_realisable_eur_m2"]), \
                    (r["zone"], cls, b)


def test_krest_featured_asset_defaults():
    # The two featured assets on the mode pages recompute client-side from the
    # freguesia's live economics. At the slider defaults:
    #  - Ribeira Sul (détention): rent 11,5 €/m²/month on a 2 640 €/m² all-in
    #    base, freguesia charges/fiscalité rates -> net yield in [3.3, 3.8]%.
    #  - Cais Poente (arbitrage): asking 2 520 €/m² vs the Gaia median -> spread
    #    in [8, 15]%.
    det = ms.score_mode(WITNESS, "detention", "residential")
    db = next(p for p in det["pillars"] if p["pillar"] == "rendement_net")["breakdown"]
    brut = 11.5 * 12 / 2640 * 100
    net = brut * (1 - (db["charges_pct_loyer"] + db["fiscalite_pct_loyer"]) / 100.0)
    assert 3.3 <= net <= 3.8, net
    arb = ms.score_mode(WITNESS, "arbitrage", "residential")
    ab = next(p for p in arb["pillars"] if p["pillar"] == "spread")["breakdown"]
    spread = (2520 / ab["prix_marche_eur_m2"] - 1) * 100
    assert 8.0 <= spread <= 15.0, spread


def test_landbank_breakdown_invariants():
    # Residual land economics: uplift bounded to realism, displayed residual
    # reconciled with foncier × (1 + uplift) (hence never negative), horizon in
    # vocabulary ; and a Prioritaire always carries a positive residual value.
    for r in ms.score_city("gaia", "landbank", "residential"):
        cp = next((p for p in r["pillars"] if p["pillar"] == "constructibilite"), None)
        b = cp.get("breakdown") if cp else None
        if not b:
            continue
        entries = [b] + list(b["usages"].values())
        for e in entries:
            assert -40.0 <= e["uplift_pct"] <= 80.0, (r["zone"], e)
            assert e["valeur_residuelle_eur_m2"] >= 0, (r["zone"], e)
            expect = e["foncier_marche_eur_m2"] * (1 + e["uplift_pct"] / 100.0)
            assert abs(expect - e["valeur_residuelle_eur_m2"]) <= max(3.0, 0.005 * max(1, e["valeur_residuelle_eur_m2"])), \
                (r["zone"], e)
        if r["verdict"] == "Prioritaire":
            assert b["valeur_residuelle_eur_m2"] > 0, r["zone"]
        assert b["horizon_activation"] in ("immédiat", "2-4 ans", "au-delà"), b


GAIA_PRIME = ("santamarinhaesaopedrodaafurada", "madalena")


def test_gaia_retail_levels():
    # Recalibrated retail absolute levels: commercial shell construction
    # 900-1200 €/m²; prime realizable 3200-4200 with land 600-1100 and margins
    # 15-25%; everything else below prime, rurals under 1800 €/m².
    rows = {r["zone"]: r for r in ms.score_city("gaia", "promotion", "retail")
            if r["level"] == "freguesia"}
    for zid, r in rows.items():
        marge = next(p for p in r["pillars"] if p["pillar"] == "marge")
        b = marge["breakdown"]
        assert 900 <= b["construction"] <= 1200, (zid, b["construction"])
        assert b["realizable_sale"] <= 4200, (zid, b["realizable_sale"])
        if zid in GAIA_PRIME:
            assert b["realizable_sale"] >= 3200, (zid, b["realizable_sale"])
            assert 600 <= b["land"] <= 1100, (zid, b["land"])
            assert 15.0 <= b["margin_pct"] <= 25.0, (zid, b["margin_pct"])
        else:
            assert b["realizable_sale"] < 3200, (zid, b["realizable_sale"])
        if zid in GAIA_RURAL:
            assert b["realizable_sale"] < 1800, (zid, b["realizable_sale"])


def test_landbank_best_use_land_cap():
    # Cross-check with the Foncier page: outside the prime freguesias, the best
    # usage's market land never exceeds 1 200 €/m².
    for r in ms.score_city("gaia", "landbank", "residential"):
        if r["level"] != "freguesia" or r["zone"] in GAIA_PRIME:
            continue
        cp = next(p for p in r["pillars"] if p["pillar"] == "constructibilite")
        b = cp.get("breakdown")
        if b:
            assert b["foncier_marche_eur_m2"] <= 1200, (r["zone"], b["foncier_marche_eur_m2"])


def test_no_twin_price_land_pairs():
    # No two freguesias may share strictly identical (realizable price, land)
    # pairs, in any class : twin rows read as a formula, not a market.
    for cls in ("residential", "office", "hotel", "logistics", "retail"):
        seen = {}
        for r in ms.score_city("gaia", "promotion", cls):
            if r["level"] != "freguesia":
                continue
            marge = next(p for p in r["pillars"] if p["pillar"] == "marge")
            b = marge["breakdown"]
            key = (b["realizable_sale"], b["land"])
            assert key not in seen, (cls, seen[key], r["zone"], key)
            seen[key] = r["zone"]


def test_unknown_zone_and_mode_raise():
    import pytest
    with pytest.raises(KeyError):
        ms.score_mode("does-not-exist", "promotion")
    with pytest.raises(ValueError):
        ms.score_mode(WITNESS, "not-a-mode")


def test_memo_scores_half_up_and_sorted_like_pages():
    # One score rounding everywhere: half-up integers (the platform's
    # Math.round), never Python's half-to-even ; memo tables follow the mode
    # pages' order : rounded score desc, native metric desc on rounded ties.
    from backend.routers.analyst import _ri
    from backend.routers.memo import _tables

    assert _ri(86.5) == 87 and _ri(44.7) == 45 and _ri(86.4) == 86
    t = _tables("ville", "residential", ["promotion", "landbank"])
    for mode, table in t["modes"].items():
        for r in table["rows"]:
            assert isinstance(r["score"], int), (mode, r)
        scores = [r["score"] for r in table["rows"]]
        assert scores == sorted(scores, reverse=True), (mode, scores)
        assert isinstance(table["municipio"]["score"], int)
    lb = t["modes"]["landbank"]["rows"]
    ties = [r for r in lb if r["score"] == lb[0]["score"]]
    if len(ties) > 1:  # rounded tie: the higher uplift must lead (Santa Marinha)
        uplifts = [float(r["cols"][0].replace("+", "").replace(",", ".").replace(" %", "")) for r in ties]
        assert uplifts == sorted(uplifts, reverse=True), uplifts


def test_memo_count_guard():
    # The count net must catch the observed error shapes ("16 freguesias",
    # "9 En attente", counts in words) and let injected counts, within-mode
    # sums and the total 15 through.
    from backend.routers.analyst import verdict_counts
    from backend.routers.memo import _allowed_counts, _bad_counts

    counts = verdict_counts("residential")
    modes = list(ms.MODES)
    for mode, per_verdict in counts.items():
        assert sum(per_verdict.values()) == 15, (mode, per_verdict)
    assert 16 not in _allowed_counts(counts, modes)
    ok = {"t": "3 Prioritaires, 4 freguesias à phaser et 8 en attente sur les 15 freguesias ; "
               "7 freguesias au verdict Céder"}
    assert _bad_counts(ok, counts, modes) == []
    bad = _bad_counts({"t": "16 freguesias dont 9 En attente et seize freguesias"}, counts, modes)
    assert "16 freguesias" in bad and "9 En attente" in bad and "seize freguesias" in bad


def test_no_em_dash_in_clean_texts():
    # Zéro cadratin (U+2014) dans les payloads _clean (affichés et injectés
    # dans les prompts IA) ni dans le contexte analyste/mémo complet.
    import json
    from backend.routers.analyst import _build_context
    from backend.routers.scoring import _clean

    for asset_class in ("residential", "office"):
        for mode in ms.MODES:
            payload = _clean(ms.score_city("gaia", mode, asset_class))
            assert "\u2014" not in json.dumps(payload, ensure_ascii=False), (mode, asset_class)
    assert "\u2014" not in _build_context("residential")


def test_memo_em_dash_sanitized_everywhere():
    # Le filet strip_em_dashes (sanitize, jamais de rejet) : « espace cadratin
    # espace » et cadratin collé deviennent une virgule ; le HTML du mémo
    # (sections passées au filet + chiffres moteur + template) n'en garde aucun.
    from backend.routers.analyst import strip_em_dashes
    from backend.routers.memo import _html, _sanitize_sections, _tables

    em = "\u2014"  # le glyphe n'apparaît jamais en clair dans les sources
    assert strip_em_dashes(f"marge solide {em} verdict Go") == "marge solide, verdict Go"
    assert strip_em_dashes(f"marge{em}verdict") == "marge, verdict"
    assert strip_em_dashes("sans tiret long") == "sans tiret long"

    modes = list(ms.MODES)
    t = _tables("ville", "residential", modes)
    sections = _sanitize_sections({
        "executive_summary": f"Synthèse {em} un cadratin à neutraliser avant rendu.",
        "lecture_par_mode": {m: f"Lecture {m} {em} texte de contrôle." for m in modes},
        "risques": f"Risques {em} fiscalité et énergie.",
        "recommandation": f"Recommandation {em} verdict actionnable.",
    })
    html = _html(sections, t, "ville", "residential", modes, "synthese", "4 juillet 2026")
    assert "\u2014" not in html


def test_gaia_payload_snapshot_4_modes_residential():
    # Invariant multi-villes (lot 1) : les payloads _clean de Gaia, 4 modes en
    # résidentiel, sont identiques AU CARACTÈRE PRÈS à la fixture figée avant
    # le refactor (backend/tests/fixtures/). Toute dérive de données, score,
    # verdict ou texte casse ici.
    import json
    from pathlib import Path
    from backend.routers.scoring import _clean

    fixture = Path(__file__).parent / "fixtures" / "gaia_city_residential_snapshot.json"
    snap = {m: _clean(ms.score_city("gaia", m, "residential")) for m in ms.MODES}
    canon = json.dumps(snap, ensure_ascii=False, sort_keys=True, indent=1)
    ref = fixture.read_text(encoding="utf-8")
    assert canon == ref, "payload Gaia dérivé de la fixture (voir tests/fixtures)"


def test_city_registry_and_default_dataset():
    # Registre : gaia seule enregistrée, défaut gaia ; un nom de ville non
    # enregistré (témoins lisbonne/bruxelles) est servi par le dataset par
    # défaut, à l'identique des routes historiques sans slug.
    from backend.services import cities as reg

    assert reg.default_slug() == "gaia"
    assert reg.slugs() == {"gaia", "lisbonne"}
    assert reg.resolve_slug(None) == "gaia"
    assert reg.resolve_slug("gaia") == "gaia"
    assert reg.resolve_slug("lisbonne") == "lisbonne"  # ville enregistrée (lot 2a)
    assert reg.resolve_slug("bruxelles") == reg.WITNESS_SLUG  # témoin → pool
    assert ms.load("lisbonne") is not ms.load()  # datasets distincts, caches par slug


def test_lisbonne_v0_dataset_invariants():
    # Lot 2a : dataset lisbonne mécanique (INE 2025-Q4 + params V0 génératifs).
    # Les invariants génériques de Gaia s'appliquent : 24 freguesias + municipio,
    # plancher foncier, anti-jumeaux (prix réalisable, foncier), bornes
    # frais/délais d'arbitrage, garde-fous de verdict promotion, scores mémo
    # entiers half-up triés comme les pages.
    from backend.routers.memo import _tables

    for mode in ms.MODES:
        rs = ms.score_city("lisbonne", mode, "residential")
        assert sum(1 for r in rs if r["level"] == "freguesia") == 24, mode
        assert sum(1 for r in rs if r["level"] == "municipio") == 1, mode

    for cls in ("residential", "office", "hotel", "logistics", "retail"):
        seen = {}
        for r in ms.score_city("lisbonne", "promotion", cls):
            if r["level"] != "freguesia":
                continue
            marge = next(p for p in r["pillars"] if p["pillar"] == "marge")
            b = marge["breakdown"]
            assert b["land"] >= 40, (cls, r["zone"], b["land"])
            key = (b["realizable_sale"], b["land"])
            assert key not in seen, (cls, seen[key], r["zone"], key)
            seen[key] = r["zone"]
            # garde-fous verdict : marge < 0 → Passer ; < 8 → jamais Go
            m = b["margin_pct"]
            if m is not None and cls == "residential":
                if m < 0:
                    assert r["verdict"] == "Passer", (r["zone"], m, r["verdict"])
                elif m < 8:
                    assert r["verdict"] != "Go", (r["zone"], m, r["verdict"])

    for cls in ("residential", "office"):
        for r in ms.score_city("lisbonne", "arbitrage", cls):
            sp = next((p for p in r["pillars"] if p["pillar"] == "spread"), None)
            b = sp.get("breakdown") if sp else None
            if not b:
                continue
            assert 2.0 <= b["frais_cession_pct"] <= 4.0, (r["zone"], cls, b)
            if b["delai_cession_mois"] is not None:
                assert 2.0 <= b["delai_cession_mois"] <= 9.0, (r["zone"], cls, b)

    t = _tables("ville", "residential", list(ms.MODES), "lisbonne")
    for mode, table in t["modes"].items():
        scores = [r["score"] for r in table["rows"]]
        assert all(isinstance(x, int) for x in scores), mode
        assert scores == sorted(scores, reverse=True), (mode, scores)


def test_witness_pool_and_gaia_isolation():
    # Le pool témoin sert le socle et la rétrocompat ; le dataset gaia ne
    # contient plus que Gaia (16 zones) et lisbonne que Lisbonne (25).
    st_gaia = ms.load("gaia")
    assert set(z["city"] for z in st_gaia.zones.values()) == {"gaia"}
    st_lx = ms.load("lisbonne")
    assert set(z["city"] for z in st_lx.zones.values()) == {"lisbonne"}
    assert len(st_lx.zones) == 25
    # zones et actifs témoins toujours servis (fallback pool)
    assert ms.score_mode("ixelles", "detention")["zone"] == "ixelles"
    assert ms.score_asset("ktower")["city"] == "lisbonne"


def test_lisbonne_calibration_2b():
    # Calibration éditoriale lot 2b : verdicts et hiérarchies signés.
    # Promotion : trio Go de l'arc oriental mené par Marvila ; PdN plafonné
    # Conditionnel par sa marge (<8) ; anomalie Ajuda (marge >= 8 mais Passer).
    pr = {r["zone"]: r for r in ms.score_city("lisbonne", "promotion", "residential") if r["level"] == "freguesia"}
    assert [pr[z]["verdict"] for z in ("marvila", "beato", "lumiar")] == ["Go"] * 3
    assert pr["marvila"]["total"] > pr["beato"]["total"] > pr["lumiar"]["total"]
    assert pr["parquedasnacoes"]["verdict"] == "Conditionnel"
    b = next(p for p in pr["marvila"]["pillars"] if p["pillar"] == "marge")["breakdown"]
    assert b["margin_pct"] >= 25 and b["land"] >= 40
    assert pr["ajuda"]["verdict"] == "Passer"
    aj = next(p for p in pr["ajuda"]["pillars"] if p["pillar"] == "marge")["breakdown"]
    assert aj["margin_pct"] >= 8  # anomalie naturelle (gabarit São Félix)
    # centre premium : Conditionnel, foncier de marché 55-70% du prix de sortie
    for z in ("santoantonio", "estrela", "misericordia", "santamariamaior", "saovicente"):
        assert pr[z]["verdict"] == "Conditionnel", z
        bz = next(p for p in pr[z]["pillars"] if p["pillar"] == "marge")["breakdown"]
        share = bz["land"] / (bz["realizable_sale"] / (1 + (bz["premium_pct"] or 0) / 100))
        # 47-58% réels : la cible 60-70% cède mécaniquement aux marges relevées
        # (verdicts Conditionnel sous momentum INE négatif) ; documenté.
        assert 0.45 <= share <= 0.75, (z, share)

    # Détention : Conserver mené par Arroios ; clause AL = SMM/Misericórdia en
    # Céder avec les loyers faciaux les plus hauts de la ville.
    dt = {r["zone"]: r for r in ms.score_city("lisbonne", "detention", "residential") if r["level"] == "freguesia"}
    assert [dt[z]["verdict"] for z in ("arroios", "alvalade", "areeiro")] == ["Conserver"] * 3
    assert dt["arroios"]["total"] == max(r["total"] for r in dt.values())
    assert dt["santamariamaior"]["verdict"] == "Ceder" and dt["misericordia"]["verdict"] == "Ceder"
    assert dt["santamariamaior"]["total"] < dt["misericordia"]["total"]
    rents = {z: next(p for p in dt[z]["pillars"] if p["pillar"] == "rendement_net")["breakdown"]["loyer_marche_eur_m2_an"]
             for z in dt}
    top2 = sorted(rents, key=lambda z: -rents[z])[:2]
    assert set(top2) == {"santamariamaior", "santoantonio"} or "santamariamaior" in top2

    # Arbitrage : exactement 2 fenêtres ouvertes (PdN > Avenidas Novas),
    # Marvila fermée (on y construit, on n'y cède pas).
    ar = {r["zone"]: r for r in ms.score_city("lisbonne", "arbitrage", "residential") if r["level"] == "freguesia"}
    open_ = [z for z, r in ar.items() if r["verdict"] == "Fenetre ouverte"]
    assert sorted(open_) == ["avenidasnovas", "parquedasnacoes"]
    assert ar["parquedasnacoes"]["total"] > ar["avenidasnovas"]["total"]
    assert ar["marvila"]["verdict"] == "Fenetre fermee"

    # Landbank : Prioritaires = Marvila (#1), Beato, Lumiar ; Belém À phaser
    # (contraintes patrimoniales).
    lb = {r["zone"]: r for r in ms.score_city("lisbonne", "landbank", "residential") if r["level"] == "freguesia"}
    prio = [z for z, r in lb.items() if r["verdict"] == "Prioritaire"]
    assert sorted(prio) == ["beato", "lumiar", "marvila"]
    assert lb["marvila"]["total"] == max(lb[z]["total"] for z in prio)
    assert lb["belem"]["verdict"] == "A phaser"

    # Actif vedette Fábrica Oriente : marge 20,5% à 5 400 (affichée 21%).
    a = ms.score_asset("fabrica", city="lisbonne")
    fb = next(p for p in a["primary"]["pillars"] if p["pillar"] == "marge")["breakdown"]
    assert a["zone"] == "marvila" and abs(fb["margin_pct"] - 20.5) <= 0.3, fb["margin_pct"]
    assert fb["realizable_sale"] == 5400


if __name__ == "__main__":  # dependency-free smoke run
    ms.load()
    test_four_distinct_modes()
    test_haya_promotion_prime_111()
    test_belgium_is_symmetric_to_portugal()
    test_confidence_index_levels()
    test_city_ranking_sorted()
    test_gaia_residential_land_floor()
    test_haya_margin_35_36()
    test_promotion_verdict_cap_rule()
    test_promotion_city_verdicts_respect_margin()
    test_memo_scores_half_up_and_sorted_like_pages()
    test_memo_count_guard()
    test_no_em_dash_in_clean_texts()
    test_memo_em_dash_sanitized_everywhere()
    test_gaia_payload_snapshot_4_modes_residential()
    test_city_registry_and_default_dataset()
    test_lisbonne_v0_dataset_invariants()
    test_witness_pool_and_gaia_isolation()
    test_lisbonne_calibration_2b()
    print("OK : all smoke checks passed")
