"""Tests du calculateur de bilan retraite (Contre-analyse).

Run: python -m pytest backend/tests/test_deal_math.py -q

Aucune dependance reseau : retreated_balance est une fonction pure.
"""

from __future__ import annotations

import re

from backend.services.deal_math import retreated_balance


# Dossier Vanderborght (Bruxelles). land_area_m2 est la surface de la parcelle,
# necessaire au seul prix du foncier par metre carre de terrain.
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
    realizable_sale_eur_m2=4344,
    cost_total_eur_m2=3367,
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
    block = retreated_balance(VANDERBORGHT)

    assert block.startswith("# BILAN RETRAITE, CALCULE")
    assert block.rstrip().endswith("plutot que de la calculer.")

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


def test_no_em_dash_in_block():
    block = retreated_balance(VANDERBORGHT)
    assert chr(8212) not in block


def test_empty_input_returns_empty_string():
    assert retreated_balance({}) == ""
    # Cles presentes mais toutes None : rien de calculable, aucune exception.
    all_none = {k: None for k in VANDERBORGHT}
    assert retreated_balance(all_none) == ""
