"""Bilan retraite calcule (Contre-analyse) : arithmetique deterministe en Python.

On retire tout calcul au LLM. retreated_balance est une fonction PURE (aucune
dependance : ni anthropic, ni mode_scoring, ni acces disque, ni reseau) : elle
recoit un dictionnaire de grandeurs deja rassemblees et produit un bloc de texte
pret a etre prepend au premier message de redaction. Le LLM n'a plus qu'a
reprendre ces valeurs, jamais a les calculer.

Deux sources alimentent ce dictionnaire, jamais confondues :
  Document (recopie par un appel LLM d'extraction qui ne fait que recopier des
  nombres, jamais calculer) :
    saleable_area_resi_m2, saleable_area_total_m2, gross_area_total_m2,
    land_area_m2, units_count,
    construction_cost_total, fees_total, remediation_total, finance_cost_total,
    land_price, transfer_duties_total, cost_total_stated,
    revenue_resi, revenue_parking, revenue_other, revenue_total_stated,
    margin_pct_stated, sale_price_eur_m2_resi, country ("be" ou "pt")
  Barzel (JAMAIS extraites par un LLM : lues dans le moteur de scoring par
  barzel_reference(), en lecture seule, pour la zone du bien) :
    realizable_sale_eur_m2, cost_total_eur_m2, land_market_eur_m2,
    residual_value_eur_m2
  barzel_zone_name : nom de la zone de reference retenue, affiche en tete du
  bloc ; absent ou None si aucune zone n'a pu etre identifiee.

Toutes les cles sont optionnelles (None si absentes ; aucune valeur par defaut
inventee). Une valeur Barzel absente entraine l'omission des lignes concernees,
jamais un calcul sur une valeur devinee.

Note : land_area_m2 est la surface du terrain (parcelle). Elle est necessaire au
seul calcul du prix du foncier par metre carre de terrain ; toutes les autres
lignes s'en passent.
"""

from __future__ import annotations

import re
import unicodedata

_HEADER = "# BILAN RETRAITE, CALCULE"
_FOOTER = ("# FIN DU BILAN RETRAITE. Reprends ces valeurs telles quelles. "
           "N'effectue aucun calcul arithmetique par toi-meme. Si une grandeur "
           "ne figure pas ci-dessus, dis qu'elle n'est pas calculable plutot que "
           "de la calculer.")


def _num(v) -> float | None:
    """Coercition douce vers float ; None si non interpretable."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = "".join(c for c in v if not c.isspace())
        for cand in (s, s.replace(",", "")):
            try:
                return float(cand)
            except ValueError:
                continue
    return None


def _ri(x: float) -> int:
    """Arrondi a l'entier, moitie vers le haut en valeur absolue."""
    return int(x + 0.5) if x >= 0 else -int(-x + 0.5)


def _fi(x: float) -> str:
    """Entier euros, separateur de milliers en espace simple, point decimal absent."""
    n = _ri(x)
    sign = "-" if n < 0 else ""
    return sign + f"{abs(n):,}".replace(",", " ")


def _fp(x: float) -> str:
    """Pourcentage a une decimale, point decimal, jamais de zero negatif."""
    s = f"{x:.1f}"
    return "0.0" if s == "-0.0" else s


def retreated_balance(data: dict) -> str:
    """Produit le bloc de bilan retraite ; chaine vide si aucun calcul possible."""
    g = {k: _num(v) for k, v in data.items()}
    country = str(data.get("country") or "").strip().lower()

    resi = g.get("saleable_area_resi_m2")
    tot = g.get("saleable_area_total_m2")
    gross = g.get("gross_area_total_m2")
    land_area = g.get("land_area_m2")

    constr = g.get("construction_cost_total")
    fees = g.get("fees_total")
    remed = g.get("remediation_total")
    fin = g.get("finance_cost_total")
    land = g.get("land_price")
    duties = g.get("transfer_duties_total")
    cost_stated = g.get("cost_total_stated")

    rev_resi = g.get("revenue_resi")
    rev_park = g.get("revenue_parking")
    rev_oth = g.get("revenue_other")
    rev_stated = g.get("revenue_total_stated")

    sale_m2 = g.get("sale_price_eur_m2_resi")
    real = g.get("realizable_sale_eur_m2")
    cost_m2 = g.get("cost_total_eur_m2")
    land_market = g.get("land_market_eur_m2")
    residual = g.get("residual_value_eur_m2")

    lines: list[str] = []

    # 1. Controle des totaux declares.
    rev_parts = [(n, v) for n, v in
                 (("revenue_resi", rev_resi), ("revenue_parking", rev_park),
                  ("revenue_other", rev_oth)) if v is not None]
    if rev_parts and rev_stated is not None:
        s = sum(v for _, v in rev_parts)
        expr = " + ".join(_fi(v) for _, v in rev_parts)
        ecart = s - rev_stated
        if abs(ecart) > 1:
            lines.append(f"{expr} = {_fi(s)} postes de sortie, total declare "
                         f"{_fi(rev_stated)}, ecart de {_fi(ecart)} eur a verifier")
        else:
            lines.append(f"{expr} = {_fi(s)} postes de sortie, coherent avec le "
                         f"total de sortie declare {_fi(rev_stated)}")

    cost_parts = [(n, v) for n, v in
                  (("construction_cost_total", constr), ("fees_total", fees),
                   ("remediation_total", remed), ("finance_cost_total", fin),
                   ("land_price", land), ("transfer_duties_total", duties))
                  if v is not None]
    if cost_parts and cost_stated is not None:
        s = sum(v for _, v in cost_parts)
        expr = " + ".join(_fi(v) for _, v in cost_parts)
        ecart = s - cost_stated
        if abs(ecart) > 1:
            lines.append(f"{expr} = {_fi(s)} postes de cout, total declare "
                         f"{_fi(cost_stated)}, ecart de {_fi(ecart)} eur a verifier")
        else:
            lines.append(f"{expr} = {_fi(s)} postes de cout, coherent avec le "
                         f"cout total declare {_fi(cost_stated)}")

    # 2. Marge declaree recalculee.
    if rev_stated is not None and cost_stated is not None:
        profit = rev_stated - cost_stated
        if rev_stated != 0:
            lines.append(f"({_fi(rev_stated)} - {_fi(cost_stated)}) / {_fi(rev_stated)} "
                         f"= {_fp(profit / rev_stated * 100)} % (marge sur sortie)")
        if cost_stated != 0:
            lines.append(f"({_fi(rev_stated)} - {_fi(cost_stated)}) / {_fi(cost_stated)} "
                         f"= {_fp(profit / cost_stated * 100)} % (marge sur cout)")

    # 3. Cout de construction dur par m2 vendable.
    if constr is not None and tot:
        lines.append(f"{_fi(constr)} / {_fi(tot)} = {_fi(constr / tot)} "
                     f"eur par m2 vendable total (construction)")
    if constr is not None and resi:
        lines.append(f"{_fi(constr)} / {_fi(resi)} = {_fi(constr / resi)} "
                     f"eur par m2 vendable residentiel (construction)")

    # 4. Cout dur majore des postes annexes declares.
    annex = [(n, v) for n, v in
             (("fees_total", fees), ("remediation_total", remed),
              ("finance_cost_total", fin)) if v is not None]
    if constr is not None and annex and tot:
        hard = constr + sum(v for _, v in annex)
        expr = " + ".join(_fi(v) for _, v in ([("construction", constr)] + annex))
        lines.append(f"({expr}) / {_fi(tot)} = {_fi(hard / tot)} "
                     f"eur par m2 vendable total (cout dur majore)")

    # 5. Ecart au cout total Barzel.
    if cost_stated is not None and tot and cost_m2 is not None:
        deal_m2 = cost_stated / tot
        lines.append(f"{_fi(cost_stated)} / {_fi(tot)} = {_fi(deal_m2)} "
                     f"eur par m2 vendable total (cout de revient du dossier)")
        gap_m2 = _ri(deal_m2) - cost_m2
        lines.append(f"{_fi(deal_m2)} - {_fi(cost_m2)} = {_fi(gap_m2)} "
                     f"eur par m2 vendable (ecart au cout total Barzel)")
        prog = cost_stated - cost_m2 * tot
        lines.append(f"{_fi(cost_stated)} - {_fi(cost_m2)} x {_fi(tot)} = {_fi(prog)} "
                     f"eur sur le programme (ecart au cout total Barzel)")

    # 6. Ecart de prix de sortie.
    if sale_m2 is not None and real is not None:
        gap = sale_m2 - real
        lines.append(f"{_fi(sale_m2)} - {_fi(real)} = {_fi(gap)} eur par m2 "
                     f"(ecart de prix de sortie vs prix realisable Barzel)")
        if real != 0:
            lines.append(f"{_fi(gap)} / {_fi(real)} = {_fp(gap / real * 100)} % "
                         f"(ecart de prix de sortie)")
        if resi:
            lines.append(f"{_fi(gap)} x {_fi(resi)} = {_fi(gap * resi)} eur sur la "
                         f"surface vendable residentielle (ecart de prix de sortie)")
    if real is not None and resi:
        lines.append(f"{_fi(real)} x {_fi(resi)} = {_fi(real * resi)} eur "
                     f"(valeur de sortie residentielle au prix realisable Barzel)")

    # 7. Foncier.
    if land is not None and land_area:
        lines.append(f"{_fi(land)} / {_fi(land_area)} = {_fi(land / land_area)} "
                     f"eur par m2 de terrain (foncier)")
    if land is not None and tot:
        lines.append(f"{_fi(land)} / {_fi(tot)} = {_fi(land / tot)} "
                     f"eur par m2 vendable (foncier)")
    if land is not None and tot and land_market is not None:
        lp = land / tot
        pos = "au-dessus" if lp > land_market else "en-dessous"
        lines.append(f"{_fi(lp)} vs {_fi(land_market)} = foncier du dossier {pos} "
                     f"du foncier de marche Barzel (eur par m2 vendable)")
    if land is not None and tot and residual is not None:
        lp = land / tot
        pos = "au-dessus" if lp > residual else "en-dessous"
        lines.append(f"{_fi(lp)} vs {_fi(residual)} = foncier du dossier {pos} "
                     f"de la valeur fonciere residuelle Barzel (eur par m2 vendable)")

    # 8. Ecart fiscal (Belgique uniquement dans ce lot).
    if country == "be" and constr is not None:
        surcout = constr * 0.15
        lines.append(f"{_fi(constr)} x 0.15 = {_fi(surcout)} eur "
                     f"(surcout de TVA, 21 % contre 6 %)")
        if resi:
            lines.append(f"{_fi(surcout)} / {_fi(resi)} = {_fi(surcout / resi)} "
                         f"eur par m2 vendable residentiel (surcout de TVA)")

    if not lines:
        return ""
    zname = str(data.get("barzel_zone_name") or "").strip()
    zone_line = (f"Zone de reference Barzel : {zname}" if zname
                 else "Zone de reference Barzel : non identifiee, "
                      "aucune comparaison Barzel possible")
    return "\n".join([_HEADER, zone_line, *lines, _FOOTER])


# --------------------------------------------------------------------------- #
# Reference Barzel : lue dans le moteur de scoring, jamais extraite par un LLM #
# --------------------------------------------------------------------------- #

_BARZEL_KEYS = ("realizable_sale_eur_m2", "cost_total_eur_m2",
                "land_market_eur_m2", "residual_value_eur_m2")


# Mots de liaison ignores dans le jeu de mots (regle 3) : ils font que
# "Ville de Bruxelles" et "Bruxelles-Ville" designent la meme zone.
_STOPWORDS = {"de", "du", "des", "la", "le", "les", "den", "ten", "op", "aan",
              "sur", "et", "van"}


def _norm(s: str) -> str:
    """Cle de comparaison de zone : minuscules, sans accents, sans tirets ni
    espaces (on ne garde que les caracteres alphanumeriques)."""
    d = unicodedata.normalize("NFKD", s or "")
    d = "".join(c for c in d if not unicodedata.combining(c))
    return "".join(c for c in d.lower() if c.isalnum())


def _tokens(s: str) -> frozenset:
    """Jeu de mots significatifs d'un nom de zone : deaccentues, minuscules, sans
    mots de liaison. Rend le matching insensible a l'ordre des mots et aux
    particules, en plus de la casse, des accents, des tirets et des espaces."""
    d = unicodedata.normalize("NFKD", s or "")
    d = "".join(c for c in d if not unicodedata.combining(c)).lower()
    raw = [t for t in re.split(r"[^a-z0-9]+", d) if t]
    sig = [t for t in raw if t not in _STOPWORDS]
    return frozenset(sig or raw)


def _pillar_breakdown(row: dict, key: str) -> dict:
    """Retourne le dict breakdown du pilier `key` d'une reponse de scoring, ou {}."""
    for p in row.get("pillars", []):
        if p.get("pillar") == key:
            return p.get("breakdown") or {}
    return {}


def _match_zone(rows: list, zone_name: str) -> dict | None:
    """Unique zone dont le nom correspond a zone_name (insensible a la casse, aux
    accents, aux tirets, aux espaces, a l'ordre des mots et aux particules de
    liaison). None si aucune correspondance ou si plusieurs (ambigu). Trois regles
    de plus en plus larges ; a chaque niveau, plusieurs candidats -> ambigu -> None."""
    key = _norm(zone_name)
    if not key:
        return None
    # Regle 1 : egalite normalisee.
    exact = [r for r in rows if _norm(r.get("zone_name") or "") == key]
    if len(exact) == 1:
        return exact[0]
    if len(exact) > 1:
        return None
    # Regle 2 : inclusion normalisee ("Bruxelles" -> "Bruxelles-Ville").
    subs = []
    for r in rows:
        zn = _norm(r.get("zone_name") or "")
        if zn and (key in zn or zn in key):
            subs.append(r)
    if len(subs) == 1:
        return subs[0]
    if len(subs) > 1:
        return None
    # Regle 3 : egalite du jeu de mots ("Ville de Bruxelles" == "Bruxelles-Ville").
    htok = _tokens(zone_name)
    toks = [r for r in rows if _tokens(r.get("zone_name") or "") == htok]
    return toks[0] if len(toks) == 1 else None


def barzel_reference(city: str, zone_name: str) -> dict:
    """Lit les quatre valeurs de reference Barzel dans le moteur de scoring, en
    LECTURE SEULE, pour la zone demandee. Retourne un dict avec les memes quatre
    cles (realizable_sale_eur_m2, cost_total_eur_m2, land_market_eur_m2,
    residual_value_eur_m2), ou un dict vide si la zone est introuvable ou ambigue.
    Aucune valeur par defaut, aucune valeur inventee, aucune moyenne de ville."""
    if not (city and zone_name):
        return {}
    try:
        from . import mode_scoring as ms  # import local : retreated_balance reste pur
        promo = ms.score_city(city, "promotion", "residential")
    except Exception:  # noqa: BLE001 ; moteur indisponible -> aucune comparaison Barzel
        return {}

    row = _match_zone(promo, zone_name)
    if row is None:
        return {}

    ref: dict = {}
    marge = _pillar_breakdown(row, "marge")
    if marge.get("realizable_sale") is not None:
        ref["realizable_sale_eur_m2"] = marge["realizable_sale"]
    if marge.get("cost_total") is not None:
        ref["cost_total_eur_m2"] = marge["cost_total"]

    try:
        land = ms.score_mode(row["zone"], "landbank", "residential", city=city)
    except Exception:  # noqa: BLE001 ; landbank indisponible -> on omet ses deux lignes
        land = None
    if land is not None:
        constr = _pillar_breakdown(land, "constructibilite")
        if constr.get("foncier_marche_eur_m2") is not None:
            ref["land_market_eur_m2"] = constr["foncier_marche_eur_m2"]
        if constr.get("valeur_residuelle_eur_m2") is not None:
            ref["residual_value_eur_m2"] = constr["valeur_residuelle_eur_m2"]

    return ref
