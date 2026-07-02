"""Barzel texture layer — SIMULATED individual listings calibrated on the real
zone-level distributions in data/backbone.json.

Nothing here invents market truth: simulated listings only restore per-property
density (for maps and the KPI engine). Every listing is labelled synthetic=true
and carries what real aggregate it was calibrated on. The displayed aggregate
numbers must remain the official backbone values, never re-derived from the
simulated sample.

    generate_listings -- draw listings from each zone's real distribution
    validate          -- re-aggregate the sample and check it matches backbone
    sim_config        -- seed, caps, calibration proxies, centroids
"""
