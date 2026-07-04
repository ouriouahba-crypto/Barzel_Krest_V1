"""Configuration + calibration proxies for the texture simulator.

All non-official parameters (dispersions, typology mixes, dwelling surfaces,
yields, days-on-market, centroids) are PROXIES used only to give simulated
listings realistic secondary attributes. They are documented here, versioned,
and every field they feed is labelled with confidence 'simule' (or 'rapport'
for broker-derived proxies) in the output, never 'officiel'/'derive'.
"""

from __future__ import annotations

import os
from pathlib import Path

from ..collect.utils import CITY_DATA_DIR, DATA_DIR, BACKBONE_OUT

# --------------------------------------------------------------------------- #
# Paths / reproducibility                                                     #
# --------------------------------------------------------------------------- #

BACKBONE = BACKBONE_OUT
LISTINGS_OUT = CITY_DATA_DIR / "listings_sim.csv"
FIDELITY_REPORT = Path(__file__).resolve().parent / "FIDELITY_REPORT.md"

# Master seed : the run is fully reproducible. Each zone/type stream also gets a
# deterministic sub-seed derived from this + its id, so output is idempotent.
SEED = int(os.environ.get("BARZEL_SIM_SEED", "42"))

# Listings per (zone, generation-type): min(n_transactions, CAP). When a zone
# has no transaction count, fall back to a low cap (thin density, still labelled).
CAP = int(os.environ.get("BARZEL_SIM_CAP", "400"))
CAP_NO_N = int(os.environ.get("BARZEL_SIM_CAP_NO_N", "40"))

# --------------------------------------------------------------------------- #
# Portugal : €/m² dispersion + typology + surface proxies                      #
# --------------------------------------------------------------------------- #

# INE publishes only a median €/m² per freguesia (no per-zone quantiles), so the
# within-zone dispersion is a national proxy (log-sigma). ~0.20 => P90/P10 ≈ 2.8,
# in line with observed local price spreads. Confidence of any sampled €/m² =
# 'simule'; it is calibrated on the officiel median (which the sample reproduces).
PT_LOG_SIGMA = float(os.environ.get("BARZEL_PT_LOG_SIGMA", "0.20"))

# Typology mix (proxy) and habitable surface per typology (lognormal m²).
# bedrooms -> (share, surface_median_m2, surface_log_sigma)
PT_TYPOLOGY = {
    1: (0.22, 55, 0.18),
    2: (0.40, 80, 0.16),
    3: (0.28, 110, 0.16),
    4: (0.10, 150, 0.18),
}
# Small share of houses (moradias) among PT listings (proxy).
PT_HOUSE_SHARE = 0.12
PT_HOUSE_SURFACE = (160, 0.20)  # (median m², log-sigma)

# Foreign-buyer share proxy per city (real SHARES are not published; only the
# per-domicile median €/m² is, which we use for the price premium). 'simule'.
PT_FOREIGN_SHARE = {"lisbonne": 0.18, "gaia": 0.10, "loule": 0.35, "alcochete": 0.08}
PT_FOREIGN_SHARE_DEFAULT = 0.12

# --------------------------------------------------------------------------- #
# Belgium : bedroom mix + (display-only) surface proxies                        #
# --------------------------------------------------------------------------- #

# BE price is sampled from the REAL total-price quantiles. We do NOT fabricate a
# BE €/m². Surface below is a display-only proxy (confidence 'simule'); it is
# NEVER used to compute a €/m².
BE_APARTMENT_BEDROOMS = {0: 0.10, 1: 0.34, 2: 0.38, 3: 0.15, 4: 0.03}
BE_HOUSE_BEDROOMS = {2: 0.15, 3: 0.42, 4: 0.31, 5: 0.12}
BE_APARTMENT_SURFACE = (85, 0.20)   # (median m², log-sigma)
BE_HOUSE_SURFACE = (160, 0.22)
# Belgium now priced in €/m² (curated commune anchor), symmetric to Portugal.
BE_LOG_SIGMA = float(os.environ.get("BARZEL_BE_LOG_SIGMA", "0.20"))
BE_HOUSE_SHARE = 0.18               # apartment-dominant urban market
BE_HOUSE_EUR_M2_FACTOR = 0.90       # houses slightly cheaper per m² than apartments

# --------------------------------------------------------------------------- #
# Yield / days-on-market proxies (calibrated on free broker outlooks)          #
# confidence 'rapport' : indicative, not a per-property truth.                 #
# --------------------------------------------------------------------------- #

# gross residential yield % (median, sigma) and DOM days (median, log-sigma).
YIELD_PROXY = {
    "pt": {"yield": (5.0, 0.6), "dom": (75, 0.35)},
    "be": {"yield": (3.6, 0.5), "dom": (105, 0.35)},
}
YIELD_CITY_OVERRIDE = {
    "lisbonne": {"yield": (4.6, 0.5)},
    "loule": {"yield": (5.4, 0.6)},
    "bruxelles": {"yield": (3.6, 0.5)},
}

# --------------------------------------------------------------------------- #
# Approximate centroids for map placement (public geographic facts).           #
# Listing coordinates = centroid + jitter, always labelled position=simule.     #
# --------------------------------------------------------------------------- #

# Belgium keyed by NIS5.
BE_CENTROIDS = {
    "21001": (50.836, 4.313), "21002": (50.816, 4.427), "21003": (50.865, 4.293),
    "21004": (50.846, 4.352), "21005": (50.836, 4.389), "21006": (50.870, 4.402),
    "21007": (50.812, 4.318), "21008": (50.871, 4.317), "21009": (50.827, 4.372),
    "21010": (50.878, 4.326), "21011": (50.862, 4.335), "21012": (50.855, 4.335),
    "21013": (50.827, 4.345), "21014": (50.853, 4.368), "21015": (50.867, 4.378),
    "21016": (50.801, 4.338), "21017": (50.796, 4.412), "21018": (50.846, 4.430),
    "21019": (50.836, 4.450), "25068": (50.636, 4.606),
}
# Portugal fallback keyed by city slug (freguesias jitter around the city point).
PT_CITY_CENTROIDS = {
    "lisbonne": (38.722, -9.139), "gaia": (41.124, -8.611),
    "loule": (37.138, -8.020), "alcochete": (38.756, -8.966),
}
JITTER_DEG_COMMUNE = 0.012   # ~1.3 km spread around a commune centroid
JITTER_DEG_CITY = 0.030      # larger spread when only a city centroid is known

# Confidence labels
CONF_SIMULE = "simule"
CONF_RAPPORT = "rapport"
CONF_OFFICIEL = "officiel"
CONF_DERIVE = "derive"

# Fidelity tolerances (fraction). Small zones (few transactions) get the looser one.
FIDELITY_TOL = float(os.environ.get("BARZEL_FIDELITY_TOL", "0.02"))
FIDELITY_TOL_SMALL = float(os.environ.get("BARZEL_FIDELITY_TOL_SMALL", "0.05"))
FIDELITY_SMALL_N = int(os.environ.get("BARZEL_FIDELITY_SMALL_N", "150"))
