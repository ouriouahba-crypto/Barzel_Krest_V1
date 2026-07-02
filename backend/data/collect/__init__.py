"""Barzel official open-data collectors.

Modules:
    config      -- static registry: target cities/zones, geo codes, source URLs.
    utils       -- HTTP/logging/atomic-write helpers.
    ine_pt      -- Portugal: INE median EUR/m2 per freguesia / municipio.
    statbel_be  -- Belgium: Statbel cadastral prices per commune / NIS9 sector.
    normalize   -- merge raw CSVs into data/backbone.json (schema-compliant).

Only free, official statistical sources are used. No commercial-portal scraping.
"""
