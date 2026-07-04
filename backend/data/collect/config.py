"""Static registry for the Barzel collectors.

This is the ONLY place that encodes "what we want to collect and from where".
Nothing here invents a measured value; it only declares targets, official
endpoints and thresholds. Anything that must be verified against the live
source before trusting the numbers is flagged with ``# VERIFY``.

Geo codes are deliberately kept minimal:
  * Portugal (INE): we do NOT hardcode DICOFRE freguesia codes. The collector
    resolves INE's own geographic dimension codes from the indicator metadata
    by matching on the (accent-normalised) place name. That avoids shipping a
    guessed code that silently maps to the wrong parish.
  * Belgium (Statbel): communes of the Brussels-Capital Region are exactly the
    NIS5 codes whose arrondissement prefix is 21, so we filter by prefix and
    add any out-of-region commune (Mont-Saint-Guibert) explicitly.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from .utils import RAW_DIR

# --------------------------------------------------------------------------- #
# Output paths                                                                 #
# --------------------------------------------------------------------------- #

INE_RAW_CSV = RAW_DIR / "ine_pt.csv"
STATBEL_RAW_CSV = RAW_DIR / "statbel_be.csv"
STATBEL_SURFACE_RAW_CSV = RAW_DIR / "statbel_surface.csv"
IBSA_RAW_CSV = RAW_DIR / "ibsa_bxl.csv"

# Cache dir for the raw upstream payloads (JSON/CSV/ZIP) -> idempotent re-runs.
CACHE_DIR = RAW_DIR / "_cache"


# --------------------------------------------------------------------------- #
# Confidence vocabulary (must match barzel_data_backbone_v0.json meta)         #
# --------------------------------------------------------------------------- #

CONF_OFFICIEL = "officiel"      # published by a national statistics office
CONF_DERIVE = "derive"          # computed from an official value (price/surface)
CONF_A_COLLECTER = "a_collecter"  # real zone, value not yet extractable

STATUS_REAL = "real"
STATUS_TODO = "a_collecter"

# Source keys : must exist in the backbone "sources" registry.
SRC_INE = "ine_local"
SRC_STATBEL = "statbel_cadastre"
SRC_STATBEL_SURFACE = "statbel_surface"   # old cadastral file (surface for eur/m2)
SRC_IBSA = "ibsa"                          # quartier geography (Brussels)
# Combined provenance for a derived eur/m2 (current price ÷ stable surface).
SRC_BE_DERIVED = "statbel_cadastre + statbel_surface"


# --------------------------------------------------------------------------- #
# Portugal / INE                                                               #
# --------------------------------------------------------------------------- #

# INE "Base de Dados" JSON API. Confirmed live 2026-07-01.
#   metadata: pindicaMeta.jsp?varcd=<code>&lang=PT
#   data:     pindica.jsp?op=2&varcd=<code>&Dim1=<period>&Dim2=<geo>&Dim3=<cat>&lang=PT
# NOTE: the query parameter is `varcd` (not `indicador`), and op=2 returns data.
INE_API_BASE = "https://www.ine.pt/ine/json_indicador"
INE_META_ENDPOINT = f"{INE_API_BASE}/pindicaMeta.jsp"
INE_DATA_ENDPOINT = f"{INE_API_BASE}/pindica.jsp"
INE_LANG = "PT"

# Indicator codes, confirmed against the live INE JSON API. Override via env.
#   0012234  Valor mediano das vendas de alojamentos familiares (12m, €/m2),
#            by NUTS-2024 geography + Categoria (Dim3: H1=Total/H11=Novos/H12=Existentes)
#   0012235  ...em apartamentos (€/m2), by geography (no Dim3)
#   0012231  ...by geography + Domicílio fiscal do comprador (Dim3: 1=nacional,
#            2=estrangeiro) ; ONLY the 8 cities >100k, with their own geo codes.
INE_INDICATOR_TOTAL = os.environ.get("INE_INDICATOR_TOTAL", "0012234").strip()
INE_INDICATOR_APARTMENTS = os.environ.get("INE_INDICATOR_APARTMENTS", "0012235").strip()
INE_INDICATOR_FISCAL = os.environ.get("INE_INDICATOR_FISCAL", "0012231").strip()
# Number of family dwellings sold in the last 12 months (transaction count),
# "Metodologia 2022", same NUTS-2024 geo + S5A periods as 0012234 (join on
# geocod). Confirmed live. 0014351 is the 3-month variant. Override via env.
INE_INDICATOR_NSALES = os.environ.get("INE_INDICATOR_NSALES", "0014363").strip()

# Compute year-over-year variation from t vs t-4 (same quarter, previous year)
# when INE publishes no official homologous-variation series. Confidence=derive.
INE_YOY_FROM_TMINUS4 = os.environ.get("INE_YOY_FROM_TMINUS4", "1").strip() not in ("0", "", "false")

# Cities whose freguesias should be harvested WHOLESALE from the API response
# (every parish under the município's geocode prefix), rather than listed by
# hand. Value = the parent município geocode prefix.
INE_HARVEST_FREGUESIAS = {"gaia": "11A1317"}

# Freguesia geocodes are only unique WITHIN a município ; several parishes share
# a name across Portugal (e.g. "Santo António" exists in Lisboa AND Funchal). We
# therefore constrain a freguesia name-match to its parent município's geocode
# prefix. Lisboa freguesias = 1A0110xx, V.N. Gaia freguesias = 11A1317xx.
INE_FREGUESIA_PREFIX = {"lisbonne": "1A0110", "gaia": "11A1317"}

# Category id (cat_id, not categ_cod) for the "Total" dwelling category of 0012234.
INE_CAT_TOTAL = "H1"
# Fiscal-domicile category ids on 0012231.
INE_FISCAL_NATIONAL = "1"
INE_FISCAL_FOREIGN = "2"

# INE rule for local prices: a category is only published with >= 33 sales.
# (n transactions itself is NOT exposed by these API indicators, only in the
# quarterly press-release Excel, so we never fabricate a count.)
INE_MIN_TRANSACTIONS = 33


@dataclass(frozen=True)
class IneTarget:
    """One geography we want INE local-price data for."""
    city: str            # backbone city slug (e.g. "lisbonne")
    name: str            # official place name as INE labels it
    level: str           # "freguesia" | "municipio"
    country: str = "pt"
    geo_code: str = ""   # INE Dim2 code; when set, matched by code (unambiguous)
    fiscal_geo: str = "" # INE 0012231 geo code for the buyer-domicile split
    aliases: tuple[str, ...] = field(default_factory=tuple)


# Lisboa & V.N. Gaia at freguesia level; Loulé & Alcochete at município level.
# Município codes are pinned (matched by code, unambiguous); freguesias are
# matched by their (prefix-stripped) name against the all-geography response.
INE_TARGETS: tuple[IneTarget, ...] = (
    # Lisboa : município (carries the buyer fiscal-domicile split) + freguesias.
    IneTarget("lisbonne", "Lisboa", "municipio", geo_code="1A01106", fiscal_geo="1A00068"),
    IneTarget("lisbonne", "Arroios", "freguesia"),
    IneTarget("lisbonne", "Carnide", "freguesia"),
    IneTarget("lisbonne", "Benfica", "freguesia"),
    IneTarget("lisbonne", "Penha de França", "freguesia", aliases=("Penha de Franca",)),
    IneTarget("lisbonne", "Olivais", "freguesia"),
    IneTarget("lisbonne", "Parque das Nações", "freguesia", aliases=("Parque das Nacoes",)),
    IneTarget("lisbonne", "Marvila", "freguesia"),
    IneTarget("lisbonne", "Santa Maria Maior", "freguesia"),
    IneTarget("lisbonne", "Misericórdia", "freguesia", aliases=("Misericordia",)),
    IneTarget("lisbonne", "Santo António", "freguesia", aliases=("Santo Antonio",)),
    # Vila Nova de Gaia : município (+ fiscal split). All 15 freguesias are
    # harvested automatically (see INE_HARVEST_FREGUESIAS).
    IneTarget("gaia", "Vila Nova de Gaia", "municipio", geo_code="11A1317", fiscal_geo="11A0021"),
    # Algarve + Setúbal : município level (no fiscal split published; <100k hab).
    IneTarget("loule", "Loulé", "municipio", geo_code="1500808", aliases=("Loule",)),
    IneTarget("alcochete", "Alcochete", "municipio", geo_code="1B01502"),
)

# Human city metadata for zones that resolve to these slugs.
CITY_META = {
    "lisbonne": {"country": "pt", "label": "Lisboa"},
    "gaia": {"country": "pt", "label": "Vila Nova de Gaia"},
    "loule": {"country": "pt", "label": "Loulé"},
    "alcochete": {"country": "pt", "label": "Alcochete"},
    "bruxelles": {"country": "be", "label": "Bruxelles-Capitale"},
    "mont_saint_guibert": {"country": "be", "label": "Mont-Saint-Guibert"},
}


# --------------------------------------------------------------------------- #
# Belgium / Statbel                                                            #
# --------------------------------------------------------------------------- #

# Statbel open-data real-estate files (confirmed URLs, July 2026).
# NIS9 statistical-sector file, "Real estate sales ... Statistical sectors":
#   landing: https://statbel.fgov.be/en/open-data/real-estate-sales-according-
#            nature-property-deed-sale-statistical-sectors-nis7-and-nis9
#   columns: CD_STAT_SECTOR, CD_YEAR, CD_TYPE(_NL/_FR), MS_TRANSACTIONS,
#            MS_P25, MS_P50, MS_P75   (NO total price / surface / P10 / P90)
STATBEL_SECTOR_URL = os.environ.get(
    "STATBEL_SECTOR_URL",
    "https://statbel.fgov.be/sites/default/files/files/opendata/"
    "Immo%20sector/TF_IMMO_SECTOR.zip",
).strip()
# NIS5 commune/Belgium file, "Real estate sales ... Belgium", carries the
# fuller P10/Q25/Q50/Q75/P90 set + transaction counts, keyed on CD_REFNIS.
STATBEL_COMMUNE_URL = os.environ.get(
    "STATBEL_COMMUNE_URL",
    "https://statbel.fgov.be/sites/default/files/files/opendata/"
    "immo/vastgoed_2010_9999.zip",
).strip()

# Format: Statbel opendata files are a ZIP wrapping one delimited .txt. They are
# cp1252-encoded with either "|" (commune file) or ";" (sector file) delimiters.
# Both are auto-detected at parse time; these are only fallbacks.
STATBEL_ENCODING = os.environ.get("STATBEL_ENCODING", "")   # "" => try utf-8 then cp1252
STATBEL_DELIMITER = os.environ.get("STATBEL_DELIMITER", "")  # "" => sniff

# Column-name candidates (verified against the July 2026 releases). Statbel
# renames columns between files/releases, so each logical field maps to several
# possible headers; the parser takes the first present. Confirmed names first.
#   commune file: CD_YEAR|CD_TYPE_FR|CD_REFNIS|CD_REFNIS_FR|CD_PERIOD|
#                 CD_CLASS_SURFACE|MS_TOTAL_TRANSACTIONS|MS_P_25|MS_P_50_median|MS_P_75
#   sector file:  CD_STAT_SECTOR;CD_YEAR;CD_TYPE_FR;MS_TRANSACTIONS;
#                 MS_P25;MS_P50 (MEDIAN_PRICE);MS_P75;MS_P10;MS_P90
STATBEL_COLUMNS = {
    "nis5": ("CD_REFNIS", "cd_refnis", "refnis"),
    "nis9": ("CD_STAT_SECTOR", "cd_stat_sector", "CD_SECTOR", "cd_sector"),
    "commune_name": ("CD_REFNIS_FR", "CD_REFNIS_NL", "TX_MUNTY_DESCR_FR", "commune"),
    "sector_name": ("TX_SECTOR_DESCR_FR", "TX_SECTOR_DESCR_NL", "sector_name"),
    "property_type": ("CD_TYPE_FR", "CD_TYPE_NL", "CD_TYPE", "building_type"),
    "refnis_level": ("CD_niveau_refnis", "CD_NIVEAU_REFNIS", "cd_niveau_refnis"),
    "period_year": ("CD_YEAR", "cd_year", "year"),
    # Sub-year period (Q1..Q4/S1/S2/Y), present in the commune file only.
    "period_part": ("CD_PERIOD", "cd_period"),
    "surface_class": ("CD_CLASS_SURFACE", "cd_class_surface"),
    "n_transactions": ("MS_TRANSACTIONS", "MS_TOTAL_TRANSACTIONS", "ms_transactions", "nb_transactions"),
    # Present in some releases; absent in both current files (so eur/m2 stays null).
    "total_price": ("MS_TOTAL_PRICE", "ms_total_price", "MS_SUM_PRICE"),
    "total_surface": ("MS_TOTAL_SURFACE", "ms_total_surface", "MS_TOTAL_AREA", "MS_SUM_SURFACE"),
    "p10": ("MS_P10", "ms_p10"),
    "q25": ("MS_P25", "MS_P_25", "ms_p25", "MS_Q25"),
    "q50": ("MS_P50 (MEDIAN_PRICE)", "MS_P_50_median", "MS_P50", "ms_p50", "MS_Q50"),
    "q75": ("MS_P75", "MS_P_75", "ms_p75", "MS_Q75"),
    "p90": ("MS_P90", "ms_p90"),
}

# Only keep the annual, all-surface aggregate to avoid multi-counting the
# quarter/semester and surface-class breakdowns in the commune file.
STATBEL_PERIOD_ANNUAL = ("Y", "")           # accepted CD_PERIOD values
STATBEL_SURFACE_TOTAL = ("totaal / total", "total", "")  # accepted CD_CLASS_SURFACE

# Brussels-Capital Region = arrondissement prefix 21 (NIS5 21001..21019).
BRUSSELS_NIS_PREFIX = "21"
# Extra communes to keep (outside the Brussels prefix). Mont-Saint-Guibert.
# VERIFY NIS5: Mont-Saint-Guibert is commonly 25068 (arr. Nivelles).
STATBEL_EXTRA_COMMUNES = {
    "25068": {"city": "mont_saint_guibert", "label": "Mont-Saint-Guibert"},
}

# Map a kept NIS5 to a backbone city slug.
def city_slug_for_nis(nis5: str) -> str | None:
    nis5 = str(nis5).strip()
    if nis5[:2] == BRUSSELS_NIS_PREFIX:
        return "bruxelles"
    extra = STATBEL_EXTRA_COMMUNES.get(nis5)
    return extra["city"] if extra else None


# When the Statbel file cannot be downloaded/parsed we still want the target
# communes to appear as a_collecter (never silently missing). Names are only
# used for labelling; the live file supplies the authoritative values.
# VERIFY NIS5 for the Brussels communes against the Statbel file at run time.
STATBEL_FALLBACK_COMMUNES = (
    {"nis": "21001", "city": "bruxelles", "label": "Anderlecht"},
    {"nis": "21004", "city": "bruxelles", "label": "Bruxelles-Ville"},
    {"nis": "21005", "city": "bruxelles", "label": "Etterbeek"},
    {"nis": "21009", "city": "bruxelles", "label": "Ixelles"},
    {"nis": "21019", "city": "bruxelles", "label": "Woluwe-Saint-Pierre"},
    {"nis": "25068", "city": "mont_saint_guibert", "label": "Mont-Saint-Guibert"},
)

# Minimum transactions before we publish a derived Statbel value (else a_collecter).
STATBEL_MIN_TRANSACTIONS = 20

# Property types we treat as residential for the derived EUR/m2.
STATBEL_RESIDENTIAL_TYPES = (
    "maison", "house", "huis",
    "appartement", "apartment", "flat",
    "maison d'habitation", "houses", "apartments",
)


# --------------------------------------------------------------------------- #
# Belgium / Statbel : SURFACE (for the derived eur/m2)                          #
# --------------------------------------------------------------------------- #

# The current transaction files carry NO surface, so eur/m2 is derived using a
# median dwelling surface from the older cadastral commune file, which DID ship
# MS_TOTAL_SURFACE + MS_TOTAL_TRANSACTIONS. Surface is structurally stable, so
# an older-year surface applied to current prices is acceptable (surface_as_of
# records the year). Confirmed file (July 2026):
STATBEL_SURFACE_URL = os.environ.get(
    "STATBEL_SURFACE_URL",
    "https://statbel.fgov.be/sites/default/files/files/opendata/"
    "Verkoop%20van%20onroerende%20goederen%20per%20gemeente%20%282010-2019%29/"
    "immo_by_municipality_2010-2019.zip",
).strip()

# Column map for the surface file (headers confirmed from the shipped XLSX).
STATBEL_SURFACE_COLUMNS = {
    "nis5": ("CD_REFNIS", "cd_refnis"),
    "commune_name": ("CD_REFNIS_FR", "CD_REFNIS_NL"),
    "property_type": ("CD_TYPE_FR", "CD_TYPE_NL", "CD_TYPE"),
    "refnis_level": ("CD_niveau_refnis", "CD_NIVEAU_REFNIS"),
    "period_year": ("CD_YEAR", "cd_year"),
    "period_part": ("CD_PERIOD", "cd_period"),
    "surface_class": ("CD_CLASS_SURFACE", "cd_class_surface"),
    "n_transactions": ("MS_TOTAL_TRANSACTIONS", "ms_total_transactions"),
    "total_surface": ("MS_TOTAL_SURFACE", "ms_total_surface"),
}

# Map a raw dwelling-type label to a broad class used to join surface <-> price.
def residential_class(type_label: str) -> str | None:
    import unicodedata
    t = "".join(c for c in unicodedata.normalize("NFKD", str(type_label))
                if not unicodedata.combining(c)).lower()
    if any(bad in t for bad in ("terrain", "grond", "bati", "batir", "bureau",
                                "commerc", "industr", "garage", "agricol")):
        return None
    # House FIRST: the aggregate label "Toutes les maisons ... (excl. appartements)"
    # contains the word "appartements", so an apartment-first test misclassifies it.
    if "maison" in t or "villa" in t or "huis" in t or "woning" in t or "bungalow" in t:
        return "house"
    if "appartement" in t or "apartment" in t or "flat" in t or "studio" in t:
        return "apartment"
    return None

# Minimum transactions before a surface cell is trusted.
STATBEL_SURFACE_MIN_TX = 20


# --------------------------------------------------------------------------- #
# Belgium / IBSA : quartier geography (opendata.brussels.be, Opendatasoft)      #
# --------------------------------------------------------------------------- #

# IBSA / opendata.brussels.be exposes NO open eur/m2 or rents dataset (only PDF
# reports + a Statbel-derived price xlsx). The one machine-readable, CC0 dataset
# is the Monitoring des Quartiers geography (quartier -> commune mapping), which
# we ingest as an enrichment. eur/m2 for Brussels is therefore DERIVED (Statbel
# surface), never taken from a commercial or non-official source.
IBSA_QUARTIERS_DATASET = os.environ.get(
    "IBSA_QUARTIERS_DATASET", "quartiers-du-monitoring-des-quartiers-ibsa-perspective-rbc").strip()
IBSA_ODS_BASE = os.environ.get(
    "IBSA_ODS_BASE", "https://opendata.brussels.be/api/explore/v2.1/catalog/datasets").strip()
