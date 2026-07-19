"""Tests du calculateur de bilan retraite (Contre-analyse).

Run: python -m pytest backend/tests/test_deal_math.py -q

Aucune dependance reseau : retreated_balance est une fonction pure.
"""

from __future__ import annotations

import re

from backend.services.deal_math import barzel_reference, retreated_balance


# Dossier Vanderborght (Bruxelles). land_area_m2 est la surface de la parcelle,
# necessaire au seul prix du foncier par metre carre de terrain. Les valeurs
# Barzel ne figurent plus ici : elles sont lues dans le moteur par
# barzel_reference() (voir BARZEL_REF, injecte explicitement pour ce test pur).
VANDERBORGHT = dict(
    saleable_area_resi_m2=8520,
    saleable_area_total_m2=9720,
    gross_area_total_m2=14300,
    land_area_m2=4200,
    construction_cost_total=23166000,
    fees_total=2316600,
    remediation_total=640000,
    finance_cost_total=1850000,
    land_price=6200000,
    transfer_duties_total=775000,
    cost_total_stated=34947600,
    revenue_resi=39192000,
    revenue_parking=2072000,
    revenue_other=2520000,
    revenue_total_stated=43784000,
    sale_price_eur_m2_resi=4600,
    country="be",
)

# Reference Barzel pour Bruxelles-Ville, telle que la produit barzel_reference()
# (lecture du moteur). Injectee en dur ici pour garder ce test pur et hors-ligne.
BARZEL_REF = dict(
    realizable_sale_eur_m2=4344,
    cost_total_eur_m2=3367,
    barzel_zone_name="Bruxelles-Ville",
)


def _result_of(block: str, label: str) -> float:
    """Recupere le nombre a droite du '=' sur la ligne portant `label`."""
    for line in block.splitlines():
        if label in line:
            after = line.split("=", 1)[1] if "=" in line else line
            m = re.search(r"-?[\d ]+(?:\.\d+)?", after)
            if m:
                return float(m.group(0).replace(" ", ""))
    raise AssertionError(f"ligne absente : {label!r}\n{block}")


def test_vanderborght_expected_values():
    block = retreated_balance({**VANDERBORGHT, **BARZEL_REF})

    assert block.startswith("# BILAN RETRAITE, CALCULE")
    assert "Zone de reference Barzel : Bruxelles-Ville" in block
    assert block.rstrip().endswith("qu'une valeur en provient.")

    # Tolerance 1 unite sur chaque grandeur derivee.
    assert abs(_result_of(block, "vendable total (construction)") - 2383) <= 1
    assert abs(_result_of(block, "vendable residentiel (construction)") - 2719) <= 1
    assert abs(_result_of(block, "cout dur majore") - 2878) <= 1
    assert abs(_result_of(block, "(marge sur sortie)") - 20.2) <= 0.1
    assert abs(_result_of(block, "(marge sur cout)") - 25.3) <= 0.1
    assert abs(_result_of(block, "eur (surcout de TVA, 21 % contre 6 %)") - 3474900) <= 1
    assert abs(_result_of(block, "residentiel (surcout de TVA)") - 408) <= 1
    assert abs(_result_of(block, "eur par m2 (ecart de prix de sortie") - 256) <= 1
    assert abs(_result_of(block, "surface vendable residentielle (ecart de prix de sortie)") - 2181120) <= 1
    assert abs(_result_of(block, "eur par m2 de terrain (foncier)") - 1476) <= 1
    # Foncier par m2 vendable : deux bases distinctes.
    assert abs(_result_of(block, "eur par m2 vendable residentiel (foncier)") - 728) <= 1
    assert abs(_result_of(block, "eur par m2 vendable total (foncier)") - 638) <= 1


def test_barzel_market_comparison_uses_residential_base():
    """La comparaison au foncier de marche Barzel porte sur la base vendable
    residentielle (728 eur par m2), jamais sur la base totale (638)."""
    block = retreated_balance({**VANDERBORGHT, **BARZEL_REF,
                               "land_market_eur_m2": 480})
    ln = next(x for x in block.splitlines() if "foncier de marche Barzel" in x)
    assert ln.startswith("728 vs")
    assert "638" not in ln
    assert "base vendable residentielle" in ln


def test_no_em_dash_in_block():
    block = retreated_balance(VANDERBORGHT)
    assert chr(8212) not in block


def test_empty_input_returns_empty_string():
    assert retreated_balance({}) == ""
    # Cles presentes mais toutes None : rien de calculable, aucune exception.
    all_none = {k: None for k in VANDERBORGHT}
    assert retreated_balance(all_none) == ""


def test_barzel_reference_reads_engine_not_llm():
    """Les quatre valeurs Barzel sont lues dans le moteur, jamais devinees par le
    LLM : realizable_sale_eur_m2 vaut la valeur reelle du moteur (4344), pas 3765."""
    from backend.services import mode_scoring as ms

    rows = ms.score_city("bruxelles", "promotion", "residential")
    bxl = next(r for r in rows if r["zone_name"] == "Bruxelles-Ville")
    engine_real = next(p for p in bxl["pillars"]
                       if p["pillar"] == "marge")["breakdown"]["realizable_sale"]

    ref = barzel_reference("bruxelles", "Bruxelles-Ville")
    assert ref["realizable_sale_eur_m2"] == engine_real  # lu dans le moteur
    assert ref["realizable_sale_eur_m2"] == 4344         # valeur reelle du moteur
    assert ref["realizable_sale_eur_m2"] != 3765         # jamais la valeur inventee par le LLM
    assert set(ref) == {"realizable_sale_eur_m2", "cost_total_eur_m2",
                        "land_market_eur_m2", "residual_value_eur_m2"}


def test_barzel_reference_unknown_zone_returns_empty():
    """Zone introuvable : dict vide, aucune exception, aucune valeur inventee."""
    assert barzel_reference("bruxelles", "zone inexistante") == {}
