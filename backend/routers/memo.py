"""Mémo d'investissement — POST /api/memo/{draft,tables,draft_section,render,revise}.

Architecture (mêmes garde-fous que l'IA analyste) :
- /draft : contexte construit EXCLUSIVEMENT des payloads passés par _clean()
  (celui de l'analyste), claude-sonnet-4-6 (temperature 0.2) rédige les
  sections narratives EN PARALLÈLE (asyncio.gather, un appel court par
  section — temps total ≈ la plus longue section). Aucun chiffre inventé,
  jamais confiance/simulation ; garde-fous comptages/arrondi PAR section.
- /tables + /draft_section : mêmes briques exposées séparément pour la
  progression réelle de la modal (une coche par section terminée).
- /render : les CHIFFRES sont injectés DÉTERMINISTIQUEMENT (KPI, tableaux,
  verdicts lus du moteur via _clean — jamais du texte IA) dans un template
  HTML de marque (polices embarquées en base64), rendu PDF via Playwright
  (Chrome système, canal "chrome" — fallback documenté : playwright install
  chromium).
- /revise : régénère une seule section narrative avec une consigne.
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import re
from datetime import date
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..services import mode_scoring as ms
from .analyst import _api_key, _build_context, _ri, verdict_counts
from .scoring import _clean

log = logging.getLogger("routers.memo")

router = APIRouter(prefix="/api/memo", tags=["memo"])

_MODEL = "claude-sonnet-4-6"
_CLASSES = {"residential", "office", "hotel", "logistics", "retail"}
_CLS_FR = {"residential": "Résidentiel", "office": "Bureaux", "hotel": "Hôtellerie",
           "logistics": "Logistique", "retail": "Commerce"}
_CLS_FILE = {"residential": "Residentiel", "office": "Bureaux", "hotel": "Hotellerie",
             "logistics": "Logistique", "retail": "Commerce"}
_MODE_FR = {"promotion": "Promotion", "detention": "Détention",
            "arbitrage": "Arbitrage", "landbank": "Foncier (landbank)"}
_ANGLES = {
    "synthese": "Synthèse d'opportunités",
    "acquisition": "Note d'acquisition",
    "detention": "Revue de détention",
}
_MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
              "août", "septembre", "octobre", "novembre", "décembre"]

_FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"


@lru_cache(maxsize=1)
def _font_css() -> str:
    """Brand fonts embedded as base64 (variable woff2, 400-700)."""
    css = []
    for fam, fname in (("Playfair Display", "playfair-var.woff2"),
                       ("Montserrat", "montserrat-var.woff2")):
        b64 = base64.b64encode((_FONT_DIR / fname).read_bytes()).decode()
        css.append(
            f"@font-face {{ font-family: '{fam}'; font-weight: 100 900; "
            f"src: url(data:font/woff2;base64,{b64}) format('woff2'); }}"
        )
    return "\n".join(css)


# --------------------------------------------------------------------------- #
# Deterministic figures — read from the engine through _clean, never from IA   #
# --------------------------------------------------------------------------- #

def _f0(v):
    return f"{round(v):,}".replace(",", " ") if v is not None else "—"


def _f1(v):
    return f"{v:.1f}".replace(".", ",") if v is not None else "—"


def _pillar_bd(z: dict, key: str) -> dict:
    p = next((p for p in z["pillars"] if p["pillar"] == key), {})
    return p.get("breakdown") or {}


def _mode_cols(mode: str, z: dict) -> list[str]:
    """Formatted metric cells for one zone row, per mode."""
    if mode == "promotion":
        b = _pillar_bd(z, "marge")
        return [f"{_f1(b.get('margin_pct'))} %", f"{_f0(b.get('realizable_sale'))} €/m²",
                f"{_f0(b.get('cost_total'))} €/m²"]
    if mode == "detention":
        b = _pillar_bd(z, "rendement_net")
        return [f"{_f1(b.get('yield_net_pct'))} %", f"{_f0(b.get('loyer_marche_eur_m2_an'))} €/m²/an",
                f"{_f1((b.get('charges_pct_loyer') or 0) + (b.get('fiscalite_pct_loyer') or 0))} % du loyer"]
    if mode == "arbitrage":
        b = _pillar_bd(z, "spread")
        sp = b.get("spread_pct")
        return [f"{'+' if (sp or 0) >= 0 else ''}{_f1(sp)} %", f"{_f0(b.get('valeur_realisable_eur_m2'))} €/m²",
                f"{_f1(b.get('delai_cession_mois'))} mois"]
    b = _pillar_bd(z, "constructibilite")
    up = b.get("uplift_pct")
    return [f"{'+' if (up or 0) >= 0 else ''}{_f1(up)} %", f"{_f0(b.get('valeur_residuelle_eur_m2'))} €/m²",
            f"{b.get('meilleur_usage', '—')} · {b.get('horizon_activation', '—')}"]


_MODE_HEADERS = {
    "promotion": ["Marge", "Prix neuf réalisable", "Coût total"],
    "detention": ["Yield net", "Loyer de marché", "Charges + fiscalité"],
    "arbitrage": ["Spread", "Valeur réalisable", "Délai de cession"],
    "landbank": ["Uplift", "Valeur résiduelle", "Meilleur usage · horizon"],
}


def _short(name: str) -> str:
    return name.replace("União das freguesias de ", "")


_NATIVE_KEY = {"promotion": ("marge", "margin_pct"),
               "detention": ("rendement_net", "yield_net_pct"),
               "arbitrage": ("spread", "spread_pct"),
               "landbank": ("constructibilite", "uplift_pct")}


def _native_metric(mode: str, z: dict) -> float:
    pillar, key = _NATIVE_KEY[mode]
    v = _pillar_bd(z, pillar).get(key)
    return v if v is not None else float("-inf")


def _tables(scope: str, asset_class: str, modes: list[str]) -> dict:
    """All deterministic figures for the memo, from cleaned engine payloads.
    Scores are half-up integers (the platform convention) ; rows follow the mode
    pages' order — rounded score desc, native metric desc on rounded ties."""
    out: dict = {"modes": {}}
    muni_seen = None
    for mode in modes:
        zones = _clean(ms.score_city("gaia", mode, asset_class))
        fregs = sorted([z for z in zones if z["level"] == "freguesia"],
                       key=lambda z: (-_ri(z["total"]), -_native_metric(mode, z)))
        muni = next((z for z in zones if z["level"] == "municipio"), None)
        muni_seen = muni_seen or muni
        rows = fregs[:3]
        scope_row = None
        if scope != "ville":
            scope_row = next((z for z in fregs if z["zone"] == scope), None)
            if scope_row is not None and scope_row not in rows:
                rows = rows + [scope_row]
        out["modes"][mode] = {
            "headers": _MODE_HEADERS[mode],
            "municipio": {"score": _ri(muni["total"]), "verdict": muni["verdict"],
                          "native": muni.get("native_indicator", {}).get("label", "")} if muni else None,
            "rows": [{"name": _short(z["zone_name"]), "score": _ri(z["total"]), "verdict": z["verdict"],
                      "cols": _mode_cols(mode, z), "is_scope": scope != "ville" and z["zone"] == scope}
                     for z in rows],
        }
    scope_name = None
    if scope != "ville":
        for mode in modes:
            zones = ms.score_city("gaia", modes[0], asset_class)
            m = next((z for z in zones if z["zone"] == scope), None)
            if m:
                scope_name = _short(m["zone_name"])
                break
    out["ville"] = {
        "price": _f0(muni_seen.get("price_eur_m2")) if muni_seen else "—",
        "yoy": (f"{'+' if (muni_seen.get('yoy_pct') or 0) >= 0 else ''}{_f1(muni_seen.get('yoy_pct'))} %"
                if muni_seen else "—"),
        "tx": _f0(muni_seen.get("n_transactions")) if muni_seen else "—",
    }
    out["scope_name"] = scope_name
    return out


# --------------------------------------------------------------------------- #
# LLM — narrative sections (same guardrails as the analyst)                    #
# --------------------------------------------------------------------------- #

_SYSTEM_MEMO = """Tu es l'analyste de Barzel Analytics, plateforme d'intelligence immobilière couvrant Vila Nova de Gaia (Portugal). Tu rédiges les sections narratives d'un mémo d'investissement institutionnel.

RÈGLES ABSOLUES :
- Tu rédiges UNIQUEMENT à partir des données fournies. Tu n'inventes JAMAIS un chiffre : chaque nombre cité doit figurer tel quel dans les données.
- Tu ne mentionnes JAMAIS de niveau de confiance, de source de donnée, de méthodologie interne ni l'idée qu'une donnée serait simulée ou estimée.
- Vila Nova de Gaia compte 15 freguesias — ces territoires s'appellent des freguesias, jamais « friches », « quartiers » ou « communes ».
- Cohérence interne : n'affirme jamais qu'un territoire domine sur tous les axes si un seul axe s'inverse ; nomme l'exception d'emblée.
- Pour tout comptage de freguesias (« N freguesias »), utilise UNIQUEMENT les comptages pré-calculés de la section DÉNOMBREMENTS — ne recompte JAMAIS toi-même à partir des listes ; au moindre doute, formule sans compte. Ne cite un rang (« premier », « deuxième ») que s'il se lit directement dans l'ordre des données.
- Tu cites les scores en entiers (« 87/100 »), jamais avec décimale.
- Français sobre et professionnel, phrases complètes, aucun markdown dans les textes.
- Longueurs : executive_summary 120-170 mots ; chaque lecture de mode 70-110 mots ; risques 80-120 mots ; recommandation 50-90 mots, conclue par un verdict actionnable."""


def _client():
    key = _api_key()
    if not key:
        raise HTTPException(status_code=503, detail="rédacteur momentanément indisponible")
    import anthropic
    return anthropic.Anthropic(api_key=key)


def _async_client():
    key = _api_key()
    if not key:
        raise HTTPException(status_code=503, detail="rédacteur momentanément indisponible")
    import anthropic
    return anthropic.AsyncAnthropic(api_key=key)


def _llm_text(system: str, user: str, max_tokens: int) -> str:
    try:
        message = _client().messages.create(
            model=_MODEL, max_tokens=max_tokens, temperature=0.2,
            system=system, messages=[{"role": "user", "content": user}],
        )
        return "".join(b.text for b in message.content if getattr(b, "type", "") == "text").strip()
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        log.warning("memo LLM call failed: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="rédacteur momentanément indisponible")


async def _llm_text_async(client, user: str, max_tokens: int) -> str:
    try:
        message = await client.messages.create(
            model=_MODEL, max_tokens=max_tokens, temperature=0.2,
            system=_SYSTEM_MEMO, messages=[{"role": "user", "content": user}],
        )
        return "".join(b.text for b in message.content if getattr(b, "type", "") == "text").strip()
    except Exception as exc:  # noqa: BLE001
        log.warning("memo LLM call failed: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="rédacteur momentanément indisponible")


class DraftPayload(BaseModel):
    scope: str = "ville"                # "ville" ou zone id de freguesia
    asset_class: str = "residential"
    modes: list[str] = ["promotion", "detention", "arbitrage", "landbank"]
    angle: str = "synthese"
    instructions: str | None = None


class RenderPayload(BaseModel):
    sections: dict
    scope: str = "ville"
    asset_class: str = "residential"
    modes: list[str] = ["promotion", "detention", "arbitrage", "landbank"]
    angle: str = "synthese"


class RevisePayload(BaseModel):
    section_id: str
    texte_actuel: str
    consigne: str
    scope: str = "ville"
    asset_class: str = "residential"


def _validate(payload) -> tuple[str, str, list[str]]:
    asset_class = payload.asset_class if payload.asset_class in _CLASSES else "residential"
    modes = [m for m in payload.modes if m in ms.MODES] or list(ms.MODES)
    scope = payload.scope if payload.scope == "ville" or payload.scope in ms.load().zones else "ville"
    return asset_class, modes, scope


def _mission(scope: str, asset_class: str, modes: list[str], angle: str,
             instructions: str | None, tables: dict) -> str:
    scope_txt = ("la ville entière" if scope == "ville"
                 else f"la freguesia {tables.get('scope_name') or scope} (au sein du marché de Gaia)")
    lines = [
        "# MISSION",
        f"Angle du mémo : {_ANGLES.get(angle, _ANGLES['synthese'])}.",
        f"Périmètre : {scope_txt}. Classe d'actif : {_CLS_FR[asset_class]}.",
        f"Modes couverts par le mémo : {', '.join(_MODE_FR[m] for m in modes)}.",
    ]
    if instructions:
        lines.append(f"Instructions du client (à respecter sans enfreindre les règles) : {instructions.strip()[:400]}")
    return "\n".join(lines)


# Per-section briefs — each section is drafted by its own short parallel call.
_SECTION_BRIEF = {
    "executive_summary": ("Synthèse exécutive", "la synthèse exécutive du mémo (120-170 mots), qui pose le "
                          "verdict d'ensemble en couvrant les modes du mémo", 650),
    "risques": ("Risques", "la section Risques (80-120 mots) : fiscalité et énergie d'abord, "
                "puis les fragilités de marché propres au périmètre", 550),
    "recommandation": ("Recommandation", "la Recommandation (50-90 mots), conclue par un verdict actionnable", 450),
}


def _section_brief(section: str) -> tuple[str, str, int]:
    if section in _SECTION_BRIEF:
        return _SECTION_BRIEF[section]
    label = f"Lecture {_MODE_FR[section]}"
    return (label, f"la lecture du mode {_MODE_FR[section]} (70-110 mots), appuyée sur ses chiffres "
                   "de freguesias et son verdict de vue ville", 500)


async def _draft_section(client, base_prompt: str, section: str,
                         counts: dict, modes: list[str]) -> str:
    """One narrative section, with the count guardrail applied per section
    (2 attempts, corrective note on retry)."""
    label, brief, max_tokens = _section_brief(section)
    user = (f"{base_prompt}\n\n# SECTION À RÉDIGER\n"
            f"Rédige UNIQUEMENT {brief}. N'écris pas de titre : le gabarit du mémo "
            f"l'affiche déjà (« {label} »). Réponds avec le texte seul, sans JSON ni markdown.")
    msg = user
    for attempt in (1, 2):
        texte = await _llm_text_async(client, msg, max_tokens)
        bad = _bad_counts({"t": texte}, counts, modes)
        if not bad:
            return texte
        if attempt == 1:
            log.warning("memo section %s: comptage hors DÉNOMBREMENTS %s, retry", section, bad)
            msg = (f"{user}\n\nATTENTION : une rédaction précédente citait un comptage de freguesias erroné "
                   f"({', '.join(bad)}). Utilise UNIQUEMENT les comptages de la section DÉNOMBREMENTS, sans recompter.")
        else:
            log.warning("memo section %s: comptage hors DÉNOMBREMENTS conservé %s", section, bad)
    return texte


# Post-generation count check, two nets:
# 1. "N freguesias" — N must be an injected count, a within-mode sum of them
#    (e.g. "7 viables" = Go + Conditionnel), or the total 15. Within-mode sums
#    never exceed 15, so a phantom "16 freguesias" can never pass.
# 2. "N <verdict>" (e.g. "9 En attente" — the exact shape of the observed
#    error) — N must equal that verdict's injected count for its own mode.
_FR_NUM = {"un": 1, "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5,
           "six": 6, "sept": 7, "huit": 8, "neuf": 9, "dix": 10, "onze": 11,
           "douze": 12, "treize": 13, "quatorze": 14, "quinze": 15, "seize": 16,
           "dix-sept": 17, "dix-huit": 18}
_NUM_ALT = r"(\d+|" + "|".join(sorted(_FR_NUM, key=len, reverse=True)) + r")"
_COUNT_RE = re.compile(_NUM_ALT + r"\s+freguesias?\b", re.IGNORECASE)
# (mode, verdict brut) -> motif d'affichage du verdict dans la prose.
_VERDICT_PAT = {
    ("promotion", "Go"): r"Go\b", ("promotion", "Conditionnel"): r"Conditionnels?\b",
    ("promotion", "Passer"): r"Passer\b",
    ("detention", "Conserver"): r"Conserver\b", ("detention", "Surveiller"): r"Surveiller\b",
    ("detention", "Ceder"): r"Céder\b",
    ("arbitrage", "Fenetre ouverte"): r"fenêtres?\s+ouvertes?\b",
    ("arbitrage", "Fenetre etroite"): r"fenêtres?\s+étroites?\b",
    ("arbitrage", "Fenetre fermee"): r"fenêtres?\s+fermées?\b",
    ("landbank", "Prioritaire"): r"Prioritaires?\b", ("landbank", "A phaser"): r"à\s+phaser\b",
    ("landbank", "En attente"): r"en\s+attente\b",
}
_VERDICT_COUNT_RES = {
    key: re.compile(_NUM_ALT + r"\s+(?:freguesias?\s+)?(?:au\s+verdict\s+|en\s+|«\s*)?" + pat,
                    re.IGNORECASE)
    for key, pat in _VERDICT_PAT.items()
}


def _to_int(tok: str) -> int:
    tok = tok.lower()
    return int(tok) if tok.isdigit() else _FR_NUM[tok]


def _allowed_counts(counts: dict, modes: list[str]) -> set[int]:
    allowed = {15}
    for mode in modes:
        vals = list(counts.get(mode, {}).values())
        allowed.update(vals)
        allowed.update(a + b for i, a in enumerate(vals) for b in vals[i + 1:])
    return allowed


def _walk_texts(sections) -> list[str]:
    if isinstance(sections, dict):
        return [t for v in sections.values() for t in _walk_texts(v)]
    return [sections] if isinstance(sections, str) else []


def _bad_counts(sections: dict, counts: dict, modes: list[str]) -> list[str]:
    allowed = _allowed_counts(counts, modes)
    bad = []
    for text in _walk_texts(sections):
        for m in _COUNT_RE.finditer(text):
            if _to_int(m.group(1)) not in allowed:
                bad.append(m.group(0))
        for (mode, verdict), rx in _VERDICT_COUNT_RES.items():
            expected = counts.get(mode, {}).get(verdict)
            if expected is None:
                continue
            for m in rx.finditer(text):
                if _to_int(m.group(1)) != expected:
                    bad.append(m.group(0))
    return bad


@router.post("/tables")
def tables_only(payload: DraftPayload) -> dict:
    """Deterministic figures + meta, instantly — first step of the modal's
    progressive draft ("Analyse des N modes")."""
    asset_class, modes, scope = _validate(payload)
    return {"tables": _tables(scope, asset_class, modes),
            "meta": {"scope": scope, "asset_class": asset_class, "modes": modes, "angle": payload.angle}}


class DraftSectionPayload(DraftPayload):
    section: str = "executive_summary"   # "executive_summary" | mode | "risques" | "recommandation"


@router.post("/draft_section")
async def draft_section(payload: DraftSectionPayload) -> dict:
    """One narrative section — the modal fires these in parallel and checks a
    progress step off as each one lands."""
    asset_class, modes, scope = _validate(payload)
    section = payload.section if payload.section in {"executive_summary", "risques", "recommandation"} \
        or payload.section in ms.MODES else "executive_summary"
    tables = _tables(scope, asset_class, modes)
    base = f"{_build_context(asset_class)}\n\n{_mission(scope, asset_class, modes, payload.angle, payload.instructions, tables)}"
    texte = await _draft_section(_async_client(), base, section, verdict_counts(asset_class), modes)
    return {"texte": texte}


@router.post("/draft")
async def draft(payload: DraftPayload) -> dict:
    """Full draft — all sections written in parallel (asyncio.gather) : wall
    time ≈ the longest single section instead of the sum of seven."""
    asset_class, modes, scope = _validate(payload)
    tables = _tables(scope, asset_class, modes)
    counts = verdict_counts(asset_class)
    base = f"{_build_context(asset_class)}\n\n{_mission(scope, asset_class, modes, payload.angle, payload.instructions, tables)}"
    client = _async_client()
    section_ids = ["executive_summary", *modes, "risques", "recommandation"]
    texts = await asyncio.gather(*[_draft_section(client, base, s, counts, modes) for s in section_ids])
    by_id = dict(zip(section_ids, texts))
    sections = {
        "executive_summary": by_id["executive_summary"],
        "lecture_par_mode": {m: by_id[m] for m in modes},
        "risques": by_id["risques"],
        "recommandation": by_id["recommandation"],
    }
    return {"sections": sections, "tables": tables,
            "meta": {"scope": scope, "asset_class": asset_class, "modes": modes, "angle": payload.angle}}


@router.post("/revise")
def revise(payload: RevisePayload) -> dict:
    asset_class, modes, scope = _validate(DraftPayload(scope=payload.scope, asset_class=payload.asset_class))
    counts = verdict_counts(asset_class)
    user = (
        f"{_build_context(asset_class)}\n\n# RÉVISION DE SECTION\n"
        f"Section : {payload.section_id}\n"
        f"Texte actuel :\n{payload.texte_actuel.strip()[:2000]}\n\n"
        f"Consigne : {payload.consigne.strip()[:300]}\n"
        "Réécris cette seule section en respectant toutes les règles, et applique la consigne de façon marquée "
        "(si on te demande de raccourcir, vise au moins un tiers de moins). Réponds avec le texte seul, sans JSON ni markdown."
    )
    msg = user
    for attempt in (1, 2):
        texte = _llm_text(_SYSTEM_MEMO, msg, max_tokens=700)
        bad = _bad_counts({"texte": texte}, counts, modes)
        if not bad or attempt == 2:
            if bad:
                log.warning("memo revise: comptage hors DÉNOMBREMENTS conservé %s", bad)
            return {"texte": texte}
        log.warning("memo revise: comptage de freguesias hors DÉNOMBREMENTS %s, retry", bad)
        msg = (f"{user}\n\nATTENTION : une rédaction précédente citait un comptage de freguesias erroné "
               f"({', '.join(bad)}). Utilise UNIQUEMENT les comptages de la section DÉNOMBREMENTS, sans recompter.")


# --------------------------------------------------------------------------- #
# Render — branded HTML → PDF (Playwright, system Chrome channel)              #
# --------------------------------------------------------------------------- #

_VERDICT_TONE = {
    "Go": "good", "Conserver": "good", "Fenetre ouverte": "good", "Prioritaire": "good",
    "Conditionnel": "mid", "Surveiller": "mid", "Fenetre etroite": "mid", "A phaser": "mid",
}
_VERDICT_FR = {"Fenetre ouverte": "Fenêtre ouverte", "Fenetre etroite": "Fenêtre étroite",
               "Fenetre fermee": "Fenêtre fermée", "Ceder": "Céder", "A phaser": "À phaser"}


def _badge(verdict: str) -> str:
    tone = _VERDICT_TONE.get(verdict, "low")
    color = {"good": "#2F6B3D", "mid": "#8a6d2f", "low": "#9E5B5B"}[tone]
    return (f'<span style="border:1px solid {color};color:{color};border-radius:99px;'
            f'padding:1px 8px;font-size:8pt;white-space:nowrap">{_VERDICT_FR.get(verdict, verdict)}</span>')


def _esc(t: str) -> str:
    return (t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# Le corps est fer à gauche (plus de justification) ; le nowrap reste utile pour
# empêcher une coupure de "non-résidents" à son trait d'union en fin de ligne.
_NOWRAP_WORD = re.compile(r"(?i)\bnon-résidents?\b")


def _rich(t: str) -> str:
    return _NOWRAP_WORD.sub(lambda m: f'<span style="white-space:nowrap">{m.group(0)}</span>', _esc(t))


def _paras(t: str) -> str:
    return "".join(f"<p>{_rich(p.strip())}</p>" for p in (t or "").split("\n") if p.strip())


_FISCAL_FACTS = [
    ("Acquisition", "IMT habitation (investisseur) 1 % → 8 %, taux uniques 6 % puis 7,5 % ; commercial et terrains 6,5 % ; Imposto do Selo 0,8 %. Non-résidents (résidentiel, dès 09/2026) : 7,5 % remboursable sous conditions."),
    ("Détention", "IMI 0,30–0,45 %/an (taux communal) ; AIMI 0,4 % (patrimoine résidentiel en société) ; IRC 19 % sur les loyers nets (+ derramas)."),
    ("Cession", "Plus-values en IRC 19 % + derramas → taux effectif ~21 %, celui des verdicts de la plateforme."),
]
_ENERGY_FACTS = [
    ("Trajectoire EPBD", "Transposition 29/05/2026 ; non-résidentiel : rénovation des 16 % les moins performants d'ici 2030, 26 % d'ici 2033 ; résidentiel : énergie primaire moyenne −16 % (2030), −20 à 22 % (2035) ; sortie des chaudières fossiles 2040."),
    ("Parc de Gaia", "Certificats SCE (A+ → F). Exposition la plus forte au centre historique (Santa Marinha : 38 % du parc en classes E-F) ; mise à niveau F→C ≈ 270 €/m², soit ≈ −0,31 point de yield net sur la première décennie pour un actif type."),
]


def _html(sections: dict, tables: dict, scope: str, asset_class: str,
          modes: list[str], angle: str, today: str) -> str:
    cls_fr = _CLS_FR[asset_class]
    scope_line = tables.get("scope_name") or "Vila Nova de Gaia"
    title_scope = f"{scope_line} · {cls_fr}" if scope != "ville" else f"Vila Nova de Gaia · {cls_fr}"
    v = tables["ville"]

    # Two modes per page keeps the memo within 4-6 pages with all four modes.
    mode_blocks = []
    for m in modes:
        t = tables["modes"][m]
        rows_html = "".join(
            f"<tr{' class=scope' if r['is_scope'] else ''}><td>{_esc(r['name'])}"
            f"{' <span class=mark>◆</span>' if r['is_scope'] else ''}</td>"
            f"<td class=val>{r['score']}</td><td>{_badge(r['verdict'])}</td>"
            + "".join(f"<td class=val>{_esc(c)}</td>" for c in r["cols"]) + "</tr>"
            for r in t["rows"]
        )
        muni = t["municipio"]
        muni_line = (f"Vue ville : score {muni['score']}/100, {_VERDICT_FR.get(muni['verdict'], muni['verdict'])}"
                     + (f" — {_esc(muni['native'])}" if muni.get("native") else "")) if muni else ""
        mode_blocks.append(f"""
  <div class="modeblock">
    <h3 class="modetitle">{_MODE_FR[m]}</h3>
    <div class="muni">{muni_line}</div>
    <table>
      <thead><tr><th>Freguesia</th><th>Score</th><th>Verdict</th>{"".join(f"<th>{h}</th>" for h in t["headers"])}</tr></thead>
      <tbody>{rows_html}</tbody>
    </table>
    <div class="narrative">{_paras(sections.get("lecture_par_mode", {}).get(m, ""))}</div>
  </div>""")
    mode_pages = []
    for i in range(0, len(mode_blocks), 2):
        pair = "".join(mode_blocks[i:i + 2])
        mode_pages.append(f"""
<section class="page">
  <div class="rule"></div>
  <div class="eyebrow">Lecture par mode</div>
  {pair}
  <div class="pagefoot">Barzel Analytics · Mémo d'investissement · {today}</div>
</section>""")

    facts_html = "".join(
        f'<div class="fact"><div class="fact-t">{k}</div><div class="fact-b">{_rich(t)}</div></div>'
        for k, t in _FISCAL_FACTS + _ENERGY_FACTS
    )

    return f"""<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>
{_font_css()}
* {{ margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
body {{ font-family:'Montserrat',sans-serif; color:#243447; font-size:10.5pt; line-height:1.55; }}
.page {{ width:210mm; height:296mm; padding:20mm 18mm 16mm; page-break-after:always; position:relative; background:#FBF9F4; overflow:hidden; }}
.cover {{ background:#0A1628; color:#F3EEE3; display:flex; flex-direction:column; justify-content:space-between; padding:28mm 22mm; }}
h1,h2,h3 {{ font-family:'Playfair Display',serif; font-weight:700; color:#0A1628; }}
.cover h1 {{ color:#F3EEE3; font-size:34px; line-height:1.15; margin-top:6px; }}
.eyebrow {{ font-size:9px; letter-spacing:2.5px; text-transform:uppercase; color:#B8965A; font-weight:600; }}
.cover .eyebrow {{ color:#C9A86A; }}
.rule {{ width:34px; height:4px; background:#C9A86A; border-radius:2px; margin-bottom:10px; }}
h2 {{ font-size:21px; margin:2px 0 10px; }}
.muni {{ font-size:9.5pt; color:#3D4C5F; margin-bottom:8px; }}
table {{ width:100%; border-collapse:collapse; margin:5px 0 10px; }}
th {{ text-align:left; font-size:8.5pt; letter-spacing:0.8px; text-transform:uppercase; color:#3D4C5F; padding:5px 8px; border-bottom:1.5px solid #0A1628; }}
td {{ padding:5px 8px; border-bottom:1px solid rgba(10,22,40,.08); font-size:9.5pt; line-height:1.35; }}
td.val {{ white-space:nowrap; }}
tr.scope td {{ background:rgba(201,168,106,.12); }}
.mark {{ color:#B8965A; }}
.narrative p {{ margin-bottom:7px; text-align:left; }}
.kpis {{ display:flex; gap:10px; margin:12px 0 16px; }}
.kpi {{ flex:1; border:1px solid rgba(10,22,40,.12); border-top:3px solid #C9A86A; border-radius:10px; padding:10px 12px; background:#fff; }}
.kpi .l {{ font-size:8pt; letter-spacing:1.2px; text-transform:uppercase; color:#6B7A8D; }}
.kpi .v {{ font-family:'Playfair Display',serif; font-size:19px; color:#0A1628; margin-top:3px; }}
.modeblock {{ margin-bottom:10px; }}
.modetitle {{ font-size:17px; margin:6px 0 4px; }}
.factgrid {{ display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; }}
.fact {{ border-left:3px solid #C9A86A; padding:6px 12px; margin-bottom:10px; background:#fff; border-radius:0 8px 8px 0; }}
.factgrid .fact {{ margin-bottom:0; }}
.fact-t {{ font-weight:600; font-size:9.5pt; color:#0A1628; }}
.fact-b {{ font-size:9pt; color:#243447; }}
.pagefoot {{ position:absolute; bottom:9mm; left:18mm; right:18mm; font-size:8pt; color:#6B7A8D; border-top:1px solid rgba(10,22,40,.12); padding-top:5px; }}
.legal {{ margin-top:14px; font-size:8.5pt; color:#6B7A8D; border-top:1px solid rgba(10,22,40,.12); padding-top:8px; }}
</style></head><body>

<section class="page cover">
  <div>
    <div class="eyebrow">Barzel Analytics</div>
    <div style="width:38px;height:4px;background:#C9A86A;border-radius:2px;margin:14px 0 26px"></div>
    <div class="eyebrow" style="letter-spacing:3px">Mémo d'investissement</div>
    <h1>{_esc(title_scope)}</h1>
    <div style="margin-top:14px;color:rgba(243,238,227,.85);font-size:11pt">{_ANGLES.get(angle, _ANGLES["synthese"])}</div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;color:rgba(243,238,227,.7);font-size:9.5pt">
    <div>{today}</div><div>Document préparé par la plateforme Barzel</div>
  </div>
</section>

<section class="page">
  <div class="rule"></div>
  <div class="eyebrow">Synthèse</div>
  <h2>Synthèse exécutive</h2>
  <div class="narrative">{_paras(sections.get("executive_summary", ""))}</div>
  <div class="eyebrow" style="margin-top:16px">Marché · Vila Nova de Gaia ({cls_fr})</div>
  <div class="kpis">
    <div class="kpi"><div class="l">Prix médian ville</div><div class="v">{v["price"]} €/m²</div></div>
    <div class="kpi"><div class="l">Évolution 12 mois</div><div class="v">{v["yoy"]}</div></div>
    <div class="kpi"><div class="l">Transactions / an</div><div class="v">{v["tx"]}</div></div>
  </div>
  <table>
    <thead><tr><th>Mode</th><th>Score ville</th><th>Verdict</th><th>Indicateur</th></tr></thead>
    <tbody>{"".join(
        f"<tr><td>{_MODE_FR[m]}</td><td class=val>{tables['modes'][m]['municipio']['score'] if tables['modes'][m]['municipio'] else '—'}</td>"
        f"<td>{_badge(tables['modes'][m]['municipio']['verdict']) if tables['modes'][m]['municipio'] else '—'}</td>"
        f"<td>{_esc(tables['modes'][m]['municipio'].get('native', '')) if tables['modes'][m]['municipio'] else ''}</td></tr>"
        for m in modes)}</tbody>
  </table>
  <div class="pagefoot">Barzel Analytics · Mémo d'investissement · {today}</div>
</section>

{"".join(mode_pages)}

<section class="page" style="page-break-after:auto">
  <div class="rule"></div>
  <div class="eyebrow">Risques · fiscalité &amp; énergie</div>
  <h2>Risques</h2>
  <div class="narrative">{_paras(sections.get("risques", ""))}</div>
  <div class="factgrid">{facts_html}</div>
  <div class="eyebrow" style="margin-top:14px">Conclusion</div>
  <h2>Recommandation</h2>
  <div class="narrative">{_paras(sections.get("recommandation", ""))}</div>
  <div class="legal">Document généré par Barzel Analytics à partir de son moteur d'analyse propriétaire.
  Les indicateurs reflètent l'état du marché à la date d'édition. Ce document est destiné à l'usage interne
  du destinataire et ne constitue pas un conseil en investissement.</div>
  <div class="pagefoot">Barzel Analytics · Mémo d'investissement · {today}</div>
</section>

</body></html>"""


def _pdf_bytes(html: str) -> bytes:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(channel="chrome", headless=True)
        except Exception:  # fallback : chromium embarqué (playwright install chromium)
            browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page()
            page.set_content(html, wait_until="load")
            pdf = page.pdf(format="A4", print_background=True,
                           margin={"top": "0", "bottom": "0", "left": "0", "right": "0"})
        finally:
            browser.close()
    return pdf


@router.post("/render")
def render(payload: RenderPayload):
    asset_class, modes, scope = _validate(payload)
    if not isinstance(payload.sections, dict):
        raise HTTPException(status_code=400, detail="sections invalides")
    tables = _tables(scope, asset_class, modes)          # chiffres du moteur, jamais du client
    d = date.today()
    today = f"{d.day} {_MONTHS_FR[d.month - 1]} {d.year}"
    html = _html(payload.sections, tables, scope, asset_class, modes, payload.angle, today)
    try:
        pdf = _pdf_bytes(html)
    except Exception as exc:  # noqa: BLE001
        log.warning("memo render failed: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="rendu momentanément indisponible")
    fname = f"Barzel_Memo_Gaia_{_CLS_FILE[asset_class]}_{d.isoformat()}.pdf"
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{fname}"'})
