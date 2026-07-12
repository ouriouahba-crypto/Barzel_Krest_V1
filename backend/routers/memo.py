"""Mémo d'investissement : POST /api/memo/{draft,tables,draft_section,render,revise}.

Architecture (mêmes garde-fous que l'IA analyste) :
- /draft : contexte construit EXCLUSIVEMENT des payloads passés par _clean()
  (celui de l'analyste), claude-sonnet-4-6 (temperature 0.2) rédige les
  sections narratives EN PARALLÈLE (asyncio.gather, un appel court par
  section ; temps total ≈ la plus longue section). Aucun chiffre inventé,
  jamais confiance/simulation ; garde-fous comptages/arrondi PAR section.
- /tables + /draft_section : mêmes briques exposées séparément pour la
  progression réelle de la modal (une coche par section terminée).
- /render : les CHIFFRES sont injectés DÉTERMINISTIQUEMENT (KPI, tableaux,
  verdicts lus du moteur via _clean, jamais du texte IA) dans un template
  HTML de marque (polices embarquées en base64), rendu PDF via Playwright
  (Chrome système, canal "chrome" ; fallback documenté : playwright install
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
from .analyst import (_api_key, _build_context, _LANG_NAME, _norm_lang, _ri,
                      _VERDICT_VOCAB, strip_em_dashes, verdict_counts)
from .scoring import _clean

log = logging.getLogger("routers.memo")

router = APIRouter(prefix="/api/memo", tags=["memo"])

_MODEL = "claude-sonnet-4-6"
_CLASSES = {"residential", "office", "hotel", "logistics", "retail"}

# --------------------------------------------------------------------------- #
# Vocabulaire par langue (lot QA-2a). INVARIANT DUR : la colonne "fr" reprend  #
# EXACTEMENT les chaînes d'avant le lot, à l'octet près (le PDF FR déjà validé #
# par le client ne doit pas bouger). En particulier _CLS["fr"]["hotel"] reste  #
# « Hôtellerie » (le moteur dit « hôtel » et l'analyste « hôtellerie » : cette #
# divergence est CONNUE et volontairement NON unifiée dans ce lot).            #
# --------------------------------------------------------------------------- #

_CLS = {
    "fr": {"residential": "Résidentiel", "office": "Bureaux", "hotel": "Hôtellerie",
           "logistics": "Logistique", "retail": "Commerce"},
    "en": {"residential": "Residential", "office": "Office", "hotel": "Hotel",
           "logistics": "Logistics", "retail": "Retail"},
    "pt": {"residential": "Residencial", "office": "Escritórios", "hotel": "Hotel",
           "logistics": "Logística", "retail": "Comércio"},
}
# Nom de fichier : ASCII pur (un en-tête HTTP Content-Disposition ne porte pas
# d'accent sans encodage RFC 5987). Même mot que la langue demandée, désaccentué.
_CLS_FILE = {
    "fr": {"residential": "Residentiel", "office": "Bureaux", "hotel": "Hotellerie",
           "logistics": "Logistique", "retail": "Commerce"},
    "en": {"residential": "Residential", "office": "Office", "hotel": "Hotel",
           "logistics": "Logistics", "retail": "Retail"},
    "pt": {"residential": "Residencial", "office": "Escritorios", "hotel": "Hotel",
           "logistics": "Logistica", "retail": "Comercio"},
}
_MODE = {
    "fr": {"promotion": "Promotion", "detention": "Détention",
           "arbitrage": "Arbitrage", "landbank": "Foncier (landbank)"},
    "en": {"promotion": "Development", "detention": "Hold",
           "arbitrage": "Arbitrage", "landbank": "Landbank"},
    "pt": {"promotion": "Promoção", "detention": "Detenção",
           "arbitrage": "Arbitragem", "landbank": "Landbank"},
}
_ANGLES = {
    "fr": {"synthese": "Synthèse d'opportunités", "acquisition": "Note d'acquisition",
           "detention": "Revue de détention"},
    "en": {"synthese": "Opportunity synthesis", "acquisition": "Acquisition note",
           "detention": "Holding review"},
    "pt": {"synthese": "Síntese de oportunidades", "acquisition": "Nota de aquisição",
           "detention": "Revisão de detenção"},
}
_MONTHS = {
    "fr": ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
           "août", "septembre", "octobre", "novembre", "décembre"],
    "en": ["January", "February", "March", "April", "May", "June", "July",
           "August", "September", "October", "November", "December"],
    "pt": ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
           "agosto", "setembro", "outubro", "novembro", "dezembro"],
}
# FR « 12 juillet 2026 » · EN « 12 July 2026 » · PT « 12 de julho de 2026 ».
_DATE_FMT = {"fr": "{d} {m} {y}", "en": "{d} {m} {y}", "pt": "{d} de {m} de {y}"}


def _angle_label(angle: str, lang: str) -> str:
    a = _ANGLES[lang]
    return a.get(angle, a["synthese"])


def _today_str(d: date, lang: str) -> str:
    return _DATE_FMT[lang].format(d=d.day, m=_MONTHS[lang][d.month - 1], y=d.year)

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
# Deterministic figures : read from the engine through _clean, never from IA   #
# --------------------------------------------------------------------------- #

def _f0(v):
    return f"{round(v):,}".replace(",", " ") if v is not None else "–"


def _f1(v):
    if v is None:
        return "–"
    # Arrondi half-up de la plateforme, jamais de zéro négatif (« -0,0 »).
    r = _ri(float(v) * 10) / 10
    if r == 0:
        r = 0.0
    return f"{r:.1f}".replace(".", ",")


def _f1s(v):
    """Variante signée : « + » sur le positif strict, jamais de zéro signé."""
    if v is None:
        return "–"
    return ("+" if _ri(float(v) * 10) > 0 else "") + _f1(v)


def _pillar_bd(z: dict, key: str) -> dict:
    p = next((p for p in z["pillars"] if p["pillar"] == key), {})
    return p.get("breakdown") or {}


# Le MOTEUR sert certaines chaînes en français (mode_scoring.py est hors périmètre
# et ne doit pas bouger) : elles atterrissent telles quelles dans le PDF. On les
# traduit donc À L'AFFICHAGE ici, sur un vocabulaire fermé (relevé exhaustif sur
# 4 villes x 5 classes x 4 modes). Toute valeur inconnue passe inchangée.
_USAGE = {  # breakdown landbank : meilleur_usage
    "fr": {},  # identité : le moteur sert déjà le français
    "en": {"résidentiel": "residential", "bureaux": "office", "hôtel": "hotel",
           "logistique": "logistics", "commerce": "retail"},
    "pt": {"résidentiel": "residencial", "bureaux": "escritórios", "hôtel": "hotel",
           "logistique": "logística", "commerce": "comércio"},
}
_HORIZON = {  # breakdown landbank : horizon_activation
    "fr": {},
    "en": {"immédiat": "immediate", "2-4 ans": "2-4 years", "au-delà": "beyond"},
    "pt": {"immédiat": "imediato", "2-4 ans": "2-4 anos", "au-delà": "mais além"},
}
# native_indicator.label : 9 gabarits distincts, tous composés de ce vocabulaire
# (les nombres et les unités ne sont JAMAIS touchés). Substitution par phrase, la
# plus longue d'abord, pour que « valorisation max hôtel » gagne sur « hôtel ».
_NATIVE_PHRASES = {
    "en": [
        ("constructibilité", "buildability"),
        ("valorisation max", "max value"),
        ("yield net", "net yield"),
        ("appétit soutenu", "sustained appetite"),
        ("appétit modéré", "moderate appetite"),
        ("appétit faible", "weak appetite"),
        ("marge", "margin"),
        ("mois", "months"),
    ],
    "pt": [
        ("constructibilité", "construtibilidade"),
        ("valorisation max", "valorização máx."),
        ("yield net", "yield líquido"),
        ("appétit soutenu", "apetite sustentado"),
        ("appétit modéré", "apetite moderado"),
        ("appétit faible", "apetite fraco"),
        ("marge", "margem"),
        ("mois", "meses"),
    ],
}


def _native_label(label: str, lang: str) -> str:
    """Traduit le libellé natif servi par le moteur (FR) sans toucher aux nombres.
    FR : identité stricte (byte-identité du PDF actuel)."""
    if lang == "fr" or not label:
        return label
    out = label
    for fr, tr in _NATIVE_PHRASES[lang]:
        out = out.replace(fr, tr)
    # Les usages ne sont traduits qu'après coup (ils suivent « max value » / « máx. »).
    for fr, tr in _USAGE[lang].items():
        out = re.sub(rf"\b{re.escape(fr)}\b", tr, out)
    return out


# Unités des cellules qui portent un mot (les autres sont des symboles neutres).
_UNIT_PCT_RENT = {"fr": "% du loyer", "en": "% of rent", "pt": "% da renda"}
_UNIT_MONTHS = {"fr": "mois", "en": "months", "pt": "meses"}


def _mode_cols(mode: str, z: dict, lang: str = "fr") -> list[str]:
    """Formatted metric cells for one zone row, per mode."""
    if mode == "promotion":
        b = _pillar_bd(z, "marge")
        return [f"{_f1(b.get('margin_pct'))} %", f"{_f0(b.get('realizable_sale'))} €/m²",
                f"{_f0(b.get('cost_total'))} €/m²"]
    if mode == "detention":
        b = _pillar_bd(z, "rendement_net")
        return [f"{_f1(b.get('yield_net_pct'))} %", f"{_f0(b.get('loyer_marche_eur_m2_an'))} €/m²/an",
                f"{_f1((b.get('charges_pct_loyer') or 0) + (b.get('fiscalite_pct_loyer') or 0))} {_UNIT_PCT_RENT[lang]}"]
    if mode == "arbitrage":
        b = _pillar_bd(z, "spread")
        return [f"{_f1s(b.get('spread_pct'))} %", f"{_f0(b.get('valeur_realisable_eur_m2'))} €/m²",
                f"{_f1(b.get('delai_cession_mois'))} {_UNIT_MONTHS[lang]}"]
    b = _pillar_bd(z, "constructibilite")
    usage = b.get("meilleur_usage", "–")
    horizon = b.get("horizon_activation", "–")
    return [f"{_f1s(b.get('uplift_pct'))} %", f"{_f0(b.get('valeur_residuelle_eur_m2'))} €/m²",
            f"{_USAGE[lang].get(usage, usage)} · {_HORIZON[lang].get(horizon, horizon)}"]


_MODE_HEADERS = {
    "fr": {
        "promotion": ["Marge", "Prix neuf réalisable", "Coût total"],
        "detention": ["Yield net", "Loyer de marché", "Charges + fiscalité"],
        "arbitrage": ["Spread", "Valeur réalisable", "Délai de cession"],
        "landbank": ["Uplift", "Valeur résiduelle", "Meilleur usage · horizon"],
    },
    "en": {
        "promotion": ["Margin", "Realizable new-build price", "Total cost"],
        "detention": ["Net yield", "Market rent", "Charges + tax"],
        "arbitrage": ["Spread", "Realizable value", "Disposal time"],
        "landbank": ["Uplift", "Residual value", "Best use · horizon"],
    },
    "pt": {
        "promotion": ["Margem", "Preço realizável de construção nova", "Custo total"],
        "detention": ["Yield líquido", "Renda de mercado", "Encargos + fiscalidade"],
        "arbitrage": ["Spread", "Valor realizável", "Prazo de alienação"],
        "landbank": ["Uplift", "Valor residual", "Melhor uso · horizonte"],
    },
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


def _tables(scope: str, asset_class: str, modes: list[str], city: str = "gaia",
            lang: str = "fr") -> dict:
    """All deterministic figures for the memo, from cleaned engine payloads.
    Scores are half-up integers (the platform convention) ; rows follow the mode
    pages' order : rounded score desc, native metric desc on rounded ties.
    `lang` ne touche QUE les libellés (en-têtes, unités, usages, libellé natif) :
    aucune valeur numérique n'en dépend."""
    out: dict = {"modes": {}}
    muni_seen = None
    for mode in modes:
        zones = _clean(ms.score_city(city, mode, asset_class))
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
            "headers": _MODE_HEADERS[lang][mode],
            "municipio": {"score": _ri(muni["total"]), "verdict": muni["verdict"],
                          "native": _native_label(muni.get("native_indicator", {}).get("label", ""), lang)} if muni else None,
            "rows": [{"name": _short(z["zone_name"]), "score": _ri(z["total"]), "verdict": z["verdict"],
                      "cols": _mode_cols(mode, z, lang), "is_scope": scope != "ville" and z["zone"] == scope}
                     for z in rows],
        }
    scope_name = None
    if scope != "ville":
        for mode in modes:
            zones = ms.score_city(city, modes[0], asset_class)
            m = next((z for z in zones if z["zone"] == scope), None)
            if m:
                scope_name = _short(m["zone_name"])
                break
    out["ville"] = {
        "price": _f0(muni_seen.get("price_eur_m2")) if muni_seen else "–",
        "yoy": f"{_f1s(muni_seen.get('yoy_pct'))} %" if muni_seen else "–",
        "tx": _f0(muni_seen.get("n_transactions")) if muni_seen else "–",
    }
    out["scope_name"] = scope_name
    return out


# --------------------------------------------------------------------------- #
# LLM : narrative sections (same guardrails as the analyst)                    #
# --------------------------------------------------------------------------- #

def _system_memo_for(city: str, asset_class: str, lang: str = "fr") -> str:
    from ..services.cities import label_for
    counts_by_mode = verdict_counts(asset_class, city)
    n_freg = sum(next(iter(counts_by_mode.values())).values()) if counts_by_mode else 15
    style, verdicts = _lang_directives(lang)
    return (_SYSTEM_MEMO_TEMPLATE.replace("{VILLE}", label_for(city)).replace("{NFREG}", str(n_freg))
            .replace("{STYLE_LINE}", style).replace("{VERDICT_LINE}", verdicts))


def _lang_directives(lang: str) -> tuple[str, str]:
    """Les deux seules lignes du prompt système qui varient. Comme chez l'analyste,
    le CONTEXTE de données reste en français : le modèle lit du FR et RÉDIGE dans
    la langue demandée.

    En FR, la ligne de style est celle d'avant le lot AU CARACTÈRE PRÈS et la ligne
    de verdicts est vide : le prompt FR est donc byte-identique à l'existant (le
    mémo FR déjà validé ne doit pas dériver). _LANG_NAME et _VERDICT_VOCAB sont
    IMPORTÉS de l'analyste, jamais redupliqués."""
    if lang == "fr":
        return ("Français sobre et professionnel, phrases complètes, aucun markdown dans les textes.", "")
    return (
        f"IMPORTANT : rédige TOUTE ta réponse en {_LANG_NAME[lang]}. Ton sobre et professionnel, "
        "phrases complètes, aucun markdown dans les textes.",
        "\n- Emploie EXACTEMENT ces libellés de verdict, dans la langue de rédaction : "
        f"{_VERDICT_VOCAB[lang]}"
        "\n- Les données ci-dessous portent les libellés de verdict BRUTS du moteur, en français "
        f"({_VERDICT_VOCAB['fr']}) : ne les recopie JAMAIS tels quels, remplace-les toujours par "
        "leur équivalent de la liste ci-dessus.",
    )


# Filet déterministe : même avec la consigne ci-dessus, le modèle recopie parfois
# le verdict FRANÇAIS BRUT lu dans le contexte (« veredicto Conserver », « Prioritaire
# landbank »). On le retraduit après coup. En FR : NO-OP strict (le mémo français ne
# doit pas bouger d'un octet). Les libellés les plus longs d'abord (« Fenêtre ouverte »
# avant « Fenêtre »), et les variantes accentuées comme brutes du moteur.
_LEAKED_VERDICTS = {
    "Fenetre ouverte", "Fenêtre ouverte", "Fenetre etroite", "Fenêtre étroite",
    "Fenetre fermee", "Fenêtre fermée", "En attente", "A phaser", "À phaser",
    "Conditionnel", "Conditionnels", "Conserver", "Surveiller", "Prioritaire",
    "Prioritaires", "Passer", "Ceder", "Céder", "Go",
}


def _canon_verdict(word: str) -> str:
    """Clé canonique du moteur pour un libellé FR éventuellement accentué/pluriel."""
    w = (word.replace("ê", "e").replace("é", "e").replace("è", "e").replace("À", "A"))
    w = w[:-1] if w.endswith("s") and w[:-1] in {"Conditionnel", "Prioritaire"} else w
    return w


def _localize_verdicts(text: str, lang: str) -> str:
    if lang == "fr" or not text:
        return text
    table = _VERDICT[lang]
    pattern = "|".join(re.escape(v) for v in sorted(_LEAKED_VERDICTS, key=len, reverse=True))

    def sub(m: re.Match) -> str:
        return table.get(_canon_verdict(m.group(0)), m.group(0))

    return re.sub(rf"\b(?:{pattern})\b", sub, text)


_SYSTEM_MEMO_TEMPLATE = """Tu es l'analyste de Barzel Analytics, plateforme d'intelligence immobilière couvrant {VILLE} (Portugal). Tu rédiges les sections narratives d'un mémo d'investissement institutionnel.

RÈGLES ABSOLUES :
- Tu rédiges UNIQUEMENT à partir des données fournies. Tu n'inventes JAMAIS un chiffre : chaque nombre cité doit figurer tel quel dans les données.
- Tu ne mentionnes JAMAIS de niveau de confiance, de source de donnée, de méthodologie interne ni l'idée qu'une donnée serait simulée ou estimée.
- {VILLE} compte {NFREG} freguesias ; ces territoires s'appellent des freguesias, jamais « friches », « quartiers » ou « communes ».
- Cohérence interne : n'affirme jamais qu'un territoire domine sur tous les axes si un seul axe s'inverse ; nomme l'exception d'emblée.
- Pour tout comptage de freguesias (« N freguesias »), utilise UNIQUEMENT les comptages pré-calculés de la section DÉNOMBREMENTS ; ne recompte JAMAIS toi-même à partir des listes ; au moindre doute, formule sans compte. Ne cite un rang (« premier », « deuxième ») que s'il se lit directement dans l'ordre des données.
- Tu cites les scores en entiers (« 87/100 »), jamais avec décimale.
- Ponctuation : tu n'utilises JAMAIS le tiret cadratin (le tiret long, U+2014), ni seul ni encadré d'espaces ; articule avec deux-points, virgule, parenthèses ou une nouvelle phrase.
- {STYLE_LINE}
- Longueurs : executive_summary 120-170 mots ; chaque lecture de mode 70-110 mots ; risques 80-120 mots ; recommandation 50-90 mots, conclue par un verdict actionnable.{VERDICT_LINE}"""


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


def _llm_text(system: str, user: str, max_tokens: int, lang: str = "fr") -> str:
    try:
        message = _client().messages.create(
            model=_MODEL, max_tokens=max_tokens, temperature=0.2,
            system=system, messages=[{"role": "user", "content": user}],
        )
        out = "".join(b.text for b in message.content if getattr(b, "type", "") == "text").strip()
        return _localize_verdicts(strip_em_dashes(out), lang)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        log.warning("memo LLM call failed: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="rédacteur momentanément indisponible")


async def _llm_text_async(client, user: str, max_tokens: int,
                          system: str | None = None, lang: str = "fr") -> str:
    try:
        message = await client.messages.create(
            model=_MODEL, max_tokens=max_tokens, temperature=0.2,
            system=system or _system_memo_for("gaia", "residential"),
            messages=[{"role": "user", "content": user}],
        )
        out = "".join(b.text for b in message.content if getattr(b, "type", "") == "text").strip()
        return _localize_verdicts(strip_em_dashes(out), lang)
    except Exception as exc:  # noqa: BLE001
        log.warning("memo LLM call failed: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="rédacteur momentanément indisponible")


# `lang` : langue de RÉDACTION du mémo (cosmétique). Optionnel, défaut « fr » =
# comportement historique ; toute valeur inconnue retombe sur « fr » via _norm_lang
# (jamais de 400, comme chez l'analyste). Le front ne l'envoie pas encore (QA-2b).
class DraftPayload(BaseModel):
    scope: str = "ville"                # "ville" ou zone id de freguesia
    asset_class: str = "residential"
    city: str = "gaia"
    modes: list[str] = ["promotion", "detention", "arbitrage", "landbank"]
    angle: str = "synthese"
    instructions: str | None = None
    lang: str = "fr"


class RenderPayload(BaseModel):
    sections: dict
    scope: str = "ville"
    asset_class: str = "residential"
    city: str = "gaia"
    modes: list[str] = ["promotion", "detention", "arbitrage", "landbank"]
    angle: str = "synthese"
    lang: str = "fr"


class RevisePayload(BaseModel):
    section_id: str
    texte_actuel: str
    consigne: str
    scope: str = "ville"
    asset_class: str = "residential"
    city: str = "gaia"
    lang: str = "fr"


def _validate(payload) -> tuple[str, str, list[str], str]:
    from ..services.cities import resolve_slug
    asset_class = payload.asset_class if payload.asset_class in _CLASSES else "residential"
    modes = [m for m in payload.modes if m in ms.MODES] or list(ms.MODES)
    city = resolve_slug(getattr(payload, "city", None))
    scope = payload.scope if payload.scope == "ville" or payload.scope in ms.load(city).zones else "ville"
    return asset_class, modes, scope, city


def _lang_of(payload) -> str:
    return _norm_lang(getattr(payload, "lang", None))


# Libellés de la mission, dans la langue de rédaction (le modèle les reprend).
_MISSION = {
    "fr": {"angle": "Angle du mémo", "scope": "Périmètre", "cls": "Classe d'actif",
           "modes": "Modes couverts par le mémo", "city_all": "la ville entière",
           "freg": "la freguesia {name} (au sein du marché de {city})",
           "instr": "Instructions du client (à respecter sans enfreindre les règles)"},
    "en": {"angle": "Memo angle", "scope": "Scope", "cls": "Asset class",
           "modes": "Modes covered by the memo", "city_all": "the whole city",
           "freg": "the freguesia {name} (within the {city} market)",
           "instr": "Client instructions (to be followed without breaking the rules)"},
    "pt": {"angle": "Ângulo do memorando", "scope": "Perímetro", "cls": "Classe de ativo",
           "modes": "Modos cobertos pelo memorando", "city_all": "a cidade inteira",
           "freg": "a freguesia {name} (no mercado de {city})",
           "instr": "Instruções do cliente (a respeitar sem infringir as regras)"},
}


def _mission(scope: str, asset_class: str, modes: list[str], angle: str,
             instructions: str | None, tables: dict, city: str = "gaia",
             lang: str = "fr") -> str:
    from ..services.cities import label_for
    t = _MISSION[lang]
    scope_txt = (t["city_all"] if scope == "ville"
                 else t["freg"].format(name=tables.get("scope_name") or scope, city=label_for(city)))
    lines = [
        "# MISSION",
        f"{t['angle']} : {_angle_label(angle, lang)}.",
        f"{t['scope']} : {scope_txt}. {t['cls']} : {_CLS[lang][asset_class]}.",
        f"{t['modes']} : {', '.join(_MODE[lang][m] for m in modes)}.",
    ]
    if instructions:
        lines.append(f"{t['instr']} : {instructions.strip()[:400]}")
    return "\n".join(lines)


# Per-section briefs : each section is drafted by its own short parallel call.
# Le LIBELLÉ est celui du titre imprimé dans le PDF (le prompt le cite pour que le
# modèle n'écrive pas de titre lui-même) : les deux doivent rester d'accord.
_SECTION_BRIEF = {
    "fr": {
        "executive_summary": ("Synthèse exécutive", "la synthèse exécutive du mémo (120-170 mots), qui pose le "
                              "verdict d'ensemble en couvrant les modes du mémo", 650),
        "risques": ("Risques", "la section Risques (80-120 mots) : fiscalité et énergie d'abord, "
                    "puis les fragilités de marché propres au périmètre", 550),
        "recommandation": ("Recommandation", "la Recommandation (50-90 mots), conclue par un verdict actionnable", 450),
    },
    "en": {
        "executive_summary": ("Executive summary", "la synthèse exécutive du mémo (120-170 mots), qui pose le "
                              "verdict d'ensemble en couvrant les modes du mémo", 650),
        "risques": ("Risks", "la section Risques (80-120 mots) : fiscalité et énergie d'abord, "
                    "puis les fragilités de marché propres au périmètre", 550),
        "recommandation": ("Recommendation", "la Recommandation (50-90 mots), conclue par un verdict actionnable", 450),
    },
    "pt": {
        "executive_summary": ("Síntese executiva", "la synthèse exécutive du mémo (120-170 mots), qui pose le "
                              "verdict d'ensemble en couvrant les modes du mémo", 650),
        "risques": ("Riscos", "la section Risques (80-120 mots) : fiscalité et énergie d'abord, "
                    "puis les fragilités de marché propres au périmètre", 550),
        "recommandation": ("Recomendação", "la Recommandation (50-90 mots), conclue par un verdict actionnable", 450),
    },
}
# Titre de la lecture d'un mode : « Lecture Promotion » / « Development reading » /
# « Leitura Promoção ».
_MODE_READING = {"fr": "Lecture {mode}", "en": "{mode} reading", "pt": "Leitura {mode}"}


def _section_brief(section: str, lang: str = "fr") -> tuple[str, str, int]:
    if section in _SECTION_BRIEF[lang]:
        return _SECTION_BRIEF[lang][section]
    label = _MODE_READING[lang].format(mode=_MODE[lang][section])
    return (label, f"la lecture du mode {_MODE[lang][section]} (70-110 mots), appuyée sur ses chiffres "
                   "de freguesias et son verdict de vue ville", 500)


async def _draft_section(client, base_prompt: str, section: str,
                         counts: dict, modes: list[str],
                         city: str = "gaia", asset_class: str = "residential",
                         lang: str = "fr") -> str:
    """One narrative section, with the count guardrail applied per section
    (2 attempts, corrective note on retry)."""
    label, brief, max_tokens = _section_brief(section, lang)
    user = (f"{base_prompt}\n\n# SECTION À RÉDIGER\n"
            f"Rédige UNIQUEMENT {brief}. N'écris pas de titre : le gabarit du mémo "
            f"l'affiche déjà (« {label} »). Réponds avec le texte seul, sans JSON ni markdown.")
    msg = user
    for attempt in (1, 2):
        texte = await _llm_text_async(client, msg, max_tokens, system=_system_memo_for(city, asset_class, lang), lang=lang)
        bad = _bad_counts({"t": texte}, counts, modes, lang)
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
# 1. "N freguesias" : N must be an injected count, a within-mode sum of them
#    (e.g. "7 viables" = Go + Conditionnel), or the total 15. Within-mode sums
#    never exceed 15, so a phantom "16 freguesias" can never pass.
# 2. "N <verdict>" (e.g. "9 En attente", the exact shape of the observed
#    error) : N must equal that verdict's injected count for its own mode.
_FR_NUM = {"un": 1, "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5,
           "six": 6, "sept": 7, "huit": 8, "neuf": 9, "dix": 10, "onze": 11,
           "douze": 12, "treize": 13, "quatorze": 14, "quinze": 15, "seize": 16,
           "dix-sept": 17, "dix-huit": 18}
_EN_NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
           "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11,
           "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
           "sixteen": 16, "seventeen": 17, "eighteen": 18}
_PT_NUM = {"um": 1, "uma": 1, "dois": 2, "duas": 2, "três": 3, "tres": 3,
           "quatro": 4, "cinco": 5, "seis": 6, "sete": 7, "oito": 8, "nove": 9,
           "dez": 10, "onze": 11, "doze": 12, "treze": 13, "catorze": 14,
           "quatorze": 14, "quinze": 15, "dezasseis": 16, "dezesseis": 16,
           "dezassete": 17, "dezessete": 17, "dezoito": 18}
_NUM_WORDS = {"fr": _FR_NUM, "en": _EN_NUM, "pt": _PT_NUM}


def _num_alt(lang: str) -> str:
    # \b en tête : sans lui, le nombre se laisse capturer À L'INTÉRIEUR d'un mot et
    # la négation devient un compte. « aucune freguesia » contient « une », « nenhuma
    # janela » contient « uma », « none » contient « one » : le filet criait alors
    # « 1 freguesia » sur une phrase qui en annonce ZÉRO (faux positif observé en PT,
    # latent en FR). Le \b interdit ces prises au milieu d'un mot.
    return r"\b(\d+|" + "|".join(sorted(_NUM_WORDS[lang], key=len, reverse=True)) + r")"


# « N freguesias » : le mot « freguesia » est INVARIANT dans les trois langues (le
# prompt système l'impose : « ces territoires s'appellent des freguesias »), seul
# le nombre écrit en toutes lettres change de langue.
_COUNT_RES = {l: re.compile(_num_alt(l) + r"\s+freguesias?\b", re.IGNORECASE)
              for l in ("fr", "en", "pt")}
_COUNT_RE = _COUNT_RES["fr"]   # conservé : ancien nom, comportement FR inchangé

# (mode, verdict brut) -> motif d'affichage du verdict dans la prose, par langue.
# EN : « Hold » (détention) est un préfixe de « On hold » (landbank) : le lookbehind
# empêche un « 8 On hold » de compter comme un « 8 Hold » du mauvais mode.
_VERDICT_PAT = {
    "fr": {
        ("promotion", "Go"): r"Go\b", ("promotion", "Conditionnel"): r"Conditionnels?\b",
        ("promotion", "Passer"): r"Passer\b",
        ("detention", "Conserver"): r"Conserver\b", ("detention", "Surveiller"): r"Surveiller\b",
        ("detention", "Ceder"): r"Céder\b",
        ("arbitrage", "Fenetre ouverte"): r"fenêtres?\s+ouvertes?\b",
        ("arbitrage", "Fenetre etroite"): r"fenêtres?\s+étroites?\b",
        ("arbitrage", "Fenetre fermee"): r"fenêtres?\s+fermées?\b",
        ("landbank", "Prioritaire"): r"Prioritaires?\b", ("landbank", "A phaser"): r"à\s+phaser\b",
        ("landbank", "En attente"): r"en\s+attente\b",
    },
    "en": {
        ("promotion", "Go"): r"Go\b", ("promotion", "Conditionnel"): r"Conditionals?\b",
        ("promotion", "Passer"): r"Pass\b",
        ("detention", "Conserver"): r"(?<!on\s)Hold\b", ("detention", "Surveiller"): r"Watch\b",
        ("detention", "Ceder"): r"Sell\b",
        ("arbitrage", "Fenetre ouverte"): r"windows?\s+open\b",
        ("arbitrage", "Fenetre etroite"): r"windows?\s+narrow\b",
        ("arbitrage", "Fenetre fermee"): r"windows?\s+closed\b",
        ("landbank", "Prioritaire"): r"Priority\b", ("landbank", "A phaser"): r"to\s+phase\b",
        ("landbank", "En attente"): r"on\s+hold\b",
    },
    "pt": {
        ("promotion", "Go"): r"Avançar\b", ("promotion", "Conditionnel"): r"Condicionais?\b",
        ("promotion", "Passer"): r"Passar\b",
        ("detention", "Conserver"): r"Manter\b", ("detention", "Surveiller"): r"Vigiar\b",
        ("detention", "Ceder"): r"Vender\b",
        ("arbitrage", "Fenetre ouverte"): r"janelas?\s+abertas?\b",
        ("arbitrage", "Fenetre etroite"): r"janelas?\s+estreitas?\b",
        ("arbitrage", "Fenetre fermee"): r"janelas?\s+fechadas?\b",
        ("landbank", "Prioritaire"): r"Priorit[áa]rios?\b", ("landbank", "A phaser"): r"a\s+fasear\b",
        ("landbank", "En attente"): r"em\s+espera\b",
    },
}
# Chevilles admises entre le nombre et le verdict, par langue.
_VERDICT_LEAD = {
    "fr": r"(?:freguesias?\s+)?(?:au\s+verdict\s+|en\s+|«\s*)?",
    "en": r"(?:freguesias?\s+)?(?:with\s+(?:a\s+)?|at\s+|rated\s+|«\s*)?",
    "pt": r"(?:freguesias?\s+)?(?:com\s+|em\s+|no\s+veredicto\s+|«\s*)?",
}
_VERDICT_COUNT_RES = {
    lang: {key: re.compile(_num_alt(lang) + r"\s+" + _VERDICT_LEAD[lang] + pat, re.IGNORECASE)
           for key, pat in pats.items()}
    for lang, pats in _VERDICT_PAT.items()
}


def _to_int(tok: str, lang: str = "fr") -> int:
    tok = tok.lower()
    return int(tok) if tok.isdigit() else _NUM_WORDS[lang][tok]


def _allowed_counts(counts: dict, modes: list[str]) -> set[int]:
    allowed = {15}
    for mode in modes:
        vals = list(counts.get(mode, {}).values())
        allowed.update(vals)
        allowed.update(a + b for i, a in enumerate(vals) for b in vals[i + 1:])
    return allowed


def _sanitize_sections(sections):
    """Applique le filet anti-cadratin à toutes les chaînes d'un arbre de
    sections (les textes reviennent du client au rendu : relecture éditable)."""
    if isinstance(sections, dict):
        return {k: _sanitize_sections(v) for k, v in sections.items()}
    return strip_em_dashes(sections) if isinstance(sections, str) else sections


def _walk_texts(sections) -> list[str]:
    if isinstance(sections, dict):
        return [t for v in sections.values() for t in _walk_texts(v)]
    return [sections] if isinstance(sections, str) else []


def _bad_counts(sections: dict, counts: dict, modes: list[str], lang: str = "fr") -> list[str]:
    allowed = _allowed_counts(counts, modes)
    bad = []
    for text in _walk_texts(sections):
        for m in _COUNT_RES[lang].finditer(text):
            if _to_int(m.group(1), lang) not in allowed:
                bad.append(m.group(0))
        for (mode, verdict), rx in _VERDICT_COUNT_RES[lang].items():
            expected = counts.get(mode, {}).get(verdict)
            if expected is None:
                continue
            for m in rx.finditer(text):
                if _to_int(m.group(1), lang) != expected:
                    bad.append(m.group(0))
    return bad


@router.post("/tables")
def tables_only(payload: DraftPayload) -> dict:
    """Deterministic figures + meta, instantly : first step of the modal's
    progressive draft ("Analyse des N modes")."""
    asset_class, modes, scope, city = _validate(payload)
    lang = _lang_of(payload)
    return {"tables": _tables(scope, asset_class, modes, city, lang),
            "meta": {"scope": scope, "asset_class": asset_class, "modes": modes, "angle": payload.angle}}


class DraftSectionPayload(DraftPayload):
    section: str = "executive_summary"   # "executive_summary" | mode | "risques" | "recommandation"


@router.post("/draft_section")
async def draft_section(payload: DraftSectionPayload) -> dict:
    """One narrative section : the modal fires these in parallel and checks a
    progress step off as each one lands."""
    asset_class, modes, scope, city = _validate(payload)
    lang = _lang_of(payload)
    section = payload.section if payload.section in {"executive_summary", "risques", "recommandation"} \
        or payload.section in ms.MODES else "executive_summary"
    tables = _tables(scope, asset_class, modes, city, lang)
    base = f"{_build_context(asset_class, city)}\n\n{_mission(scope, asset_class, modes, payload.angle, payload.instructions, tables, city, lang)}"
    texte = await _draft_section(_async_client(), base, section, verdict_counts(asset_class, city), modes,
                                 city=city, asset_class=asset_class, lang=lang)
    return {"texte": texte}


@router.post("/draft")
async def draft(payload: DraftPayload) -> dict:
    """Full draft : all sections written in parallel (asyncio.gather) ; wall
    time ≈ the longest single section instead of the sum of seven."""
    asset_class, modes, scope, city = _validate(payload)
    lang = _lang_of(payload)
    tables = _tables(scope, asset_class, modes, city, lang)
    counts = verdict_counts(asset_class, city)
    base = f"{_build_context(asset_class, city)}\n\n{_mission(scope, asset_class, modes, payload.angle, payload.instructions, tables, city, lang)}"
    client = _async_client()
    section_ids = ["executive_summary", *modes, "risques", "recommandation"]
    texts = await asyncio.gather(*[_draft_section(client, base, s, counts, modes, city=city, asset_class=asset_class, lang=lang)
                                   for s in section_ids])
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
    asset_class, modes, scope, city = _validate(DraftPayload(scope=payload.scope, asset_class=payload.asset_class, city=payload.city))
    lang = _lang_of(payload)
    counts = verdict_counts(asset_class, city)
    user = (
        f"{_build_context(asset_class, city)}\n\n# RÉVISION DE SECTION\n"
        f"Section : {payload.section_id}\n"
        f"Texte actuel :\n{payload.texte_actuel.strip()[:2000]}\n\n"
        f"Consigne : {payload.consigne.strip()[:300]}\n"
        "Réécris cette seule section en respectant toutes les règles, et applique la consigne de façon marquée "
        "(si on te demande de raccourcir, vise au moins un tiers de moins). Réponds avec le texte seul, sans JSON ni markdown."
    )
    msg = user
    for attempt in (1, 2):
        texte = _llm_text(_system_memo_for(city, asset_class, lang), msg, max_tokens=700, lang=lang)
        bad = _bad_counts({"texte": texte}, counts, modes, lang)
        if not bad or attempt == 2:
            if bad:
                log.warning("memo revise: comptage hors DÉNOMBREMENTS conservé %s", bad)
            return {"texte": texte}
        log.warning("memo revise: comptage de freguesias hors DÉNOMBREMENTS %s, retry", bad)
        msg = (f"{user}\n\nATTENTION : une rédaction précédente citait un comptage de freguesias erroné "
               f"({', '.join(bad)}). Utilise UNIQUEMENT les comptages de la section DÉNOMBREMENTS, sans recompter.")


# --------------------------------------------------------------------------- #
# Render : branded HTML → PDF (Playwright, system Chrome channel)              #
# --------------------------------------------------------------------------- #

_VERDICT_TONE = {
    "Go": "good", "Conserver": "good", "Fenetre ouverte": "good", "Prioritaire": "good",
    "Conditionnel": "mid", "Surveiller": "mid", "Fenetre etroite": "mid", "A phaser": "mid",
}
# Verdict BRUT du moteur (clé canonique, jamais traduite dans les payloads) ->
# libellé d'affichage. En FR, la table ne porte que les accents (les libellés déjà
# corrects passent par le repli .get(v, v)) : sortie inchangée à l'octet près.
_VERDICT = {
    "fr": {"Fenetre ouverte": "Fenêtre ouverte", "Fenetre etroite": "Fenêtre étroite",
           "Fenetre fermee": "Fenêtre fermée", "Ceder": "Céder", "A phaser": "À phaser"},
    "en": {"Go": "Go", "Conditionnel": "Conditional", "Passer": "Pass",
           "Conserver": "Hold", "Surveiller": "Watch", "Ceder": "Sell",
           "Fenetre ouverte": "Window open", "Fenetre etroite": "Window narrow",
           "Fenetre fermee": "Window closed",
           "Prioritaire": "Priority", "A phaser": "To phase", "En attente": "On hold"},
    "pt": {"Go": "Avançar", "Conditionnel": "Condicional", "Passer": "Passar",
           "Conserver": "Manter", "Surveiller": "Vigiar", "Ceder": "Vender",
           "Fenetre ouverte": "Janela aberta", "Fenetre etroite": "Janela estreita",
           "Fenetre fermee": "Janela fechada",
           "Prioritaire": "Prioritário", "A phaser": "A fasear", "En attente": "Em espera"},
}
_VERDICT_FR = _VERDICT["fr"]   # conservé : ancien nom, mêmes valeurs


def _verdict(verdict: str, lang: str = "fr") -> str:
    return _VERDICT[lang].get(verdict, verdict)


def _badge(verdict: str, lang: str = "fr") -> str:
    tone = _VERDICT_TONE.get(verdict, "low")
    color = {"good": "#2F6B3D", "mid": "#8a6d2f", "low": "#9E5B5B"}[tone]
    return (f'<span style="border:1px solid {color};color:{color};border-radius:99px;'
            f'padding:1px 8px;font-size:8pt;white-space:nowrap">{_verdict(verdict, lang)}</span>')


def _esc(t: str) -> str:
    return (t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# Le corps est fer à gauche (plus de justification) ; le nowrap reste utile pour
# empêcher une coupure de "non-résidents" à son trait d'union en fin de ligne.
_NOWRAP_WORD = re.compile(r"(?i)\bnon-résidents?\b")


def _rich(t: str) -> str:
    return _NOWRAP_WORD.sub(lambda m: f'<span style="white-space:nowrap">{m.group(0)}</span>', _esc(t))


def _paras(t: str) -> str:
    return "".join(f"<p>{_rich(p.strip())}</p>" for p in (t or "").split("\n") if p.strip())


_FISCAL_FACTS = {
    "fr": [
        ("Acquisition", "IMT habitation (investisseur) 1 % → 8 %, taux uniques 6 % puis 7,5 % ; commercial et terrains 6,5 % ; Imposto do Selo 0,8 %. Non-résidents (résidentiel, dès 09/2026) : 7,5 % remboursable sous conditions."),
        ("Détention", "IMI 0,30–0,45 %/an (taux communal) ; AIMI 0,4 % (patrimoine résidentiel en société) ; IRC 19 % sur les loyers nets (+ derramas)."),
        ("Cession", "Plus-values en IRC 19 % + derramas → taux effectif ~21 %, celui des verdicts de la plateforme."),
    ],
    "en": [
        ("Acquisition", "IMT on housing (investor) 1 % → 8 %, flat rates 6 % then 7,5 % ; commercial and land 6,5 % ; Imposto do Selo 0,8 %. Non-residents (residential, from 09/2026) : 7,5 %, refundable under conditions."),
        ("Holding", "IMI 0,30–0,45 %/year (municipal rate) ; AIMI 0,4 % (residential assets held in a company) ; IRC 19 % on net rents (+ derramas)."),
        ("Disposal", "Capital gains taxed under IRC 19 % + derramas → effective rate ~21 %, the one behind the platform's verdicts."),
    ],
    "pt": [
        ("Aquisição", "IMT habitação (investidor) 1 % → 8 %, taxas únicas 6 % e depois 7,5 % ; comercial e terrenos 6,5 % ; Imposto do Selo 0,8 %. Não residentes (residencial, a partir de 09/2026) : 7,5 %, reembolsável sob condições."),
        ("Detenção", "IMI 0,30–0,45 %/ano (taxa municipal) ; AIMI 0,4 % (património residencial em sociedade) ; IRC 19 % sobre as rendas líquidas (+ derramas)."),
        ("Alienação", "Mais-valias em IRC 19 % + derramas → taxa efetiva ~21 %, a dos veredictos da plataforma."),
    ],
}
_ENERGY_FACTS_COMMON = {
    "fr": [("Trajectoire EPBD", "Transposition 29/05/2026 ; non-résidentiel : rénovation des 16 % les moins performants d'ici 2030, 26 % d'ici 2033 ; résidentiel : énergie primaire moyenne −16 % (2030), −20 à 22 % (2035) ; sortie des chaudières fossiles 2040.")],
    "en": [("EPBD trajectory", "Transposition 29/05/2026 ; non-residential : the worst-performing 16 % renovated by 2030, 26 % by 2033 ; residential : average primary energy −16 % (2030), −20 to 22 % (2035) ; fossil-fuel boilers phased out by 2040.")],
    "pt": [("Trajetória EPBD", "Transposição 29/05/2026 ; não residencial : renovação dos 16 % menos eficientes até 2030, 26 % até 2033 ; residencial : energia primária média −16 % (2030), −20 a 22 % (2035) ; fim das caldeiras fósseis em 2040.")],
}
_ENERGY_FACTS_GAIA = {
    "fr": [("Parc de Gaia", "Certificats SCE (A+ → F). Exposition la plus forte au centre historique (Santa Marinha : 38 % du parc en classes E-F) ; mise à niveau F→C ≈ 270 €/m², soit ≈ −0,31 point de yield net sur la première décennie pour un actif type.")],
    "en": [("Gaia housing stock", "SCE certificates (A+ → F). Highest exposure in the historic centre (Santa Marinha : 38 % of the stock in classes E-F) ; an F→C upgrade costs ≈ 270 €/m², i.e. ≈ −0,31 point of net yield over the first decade for a typical asset.")],
    "pt": [("Parque de Gaia", "Certificados SCE (A+ → F). Exposição mais forte no centro histórico (Santa Marinha : 38 % do parque em classes E-F) ; a requalificação F→C custa ≈ 270 €/m², ou seja ≈ −0,31 ponto de yield líquido na primeira década para um ativo tipo.")],
}


def _facts_for_city(city: str, lang: str = "fr") -> list:
    """Faits fiscalité/énergie du mémo : le parc SCE simulé est propre à Gaia."""
    return (_FISCAL_FACTS[lang] + _ENERGY_FACTS_COMMON[lang]
            + (_ENERGY_FACTS_GAIA[lang] if city == "gaia" else []))


# Libellés fixes du gabarit PDF, par langue. Le FR reprend EXACTEMENT les chaînes
# d'avant le lot (le rendu FR ne doit pas bouger d'un octet).
_PDF = {
    "fr": {
        "memo": "Mémo d'investissement", "prepared": "Document préparé par la plateforme Barzel",
        "eyb_summary": "Synthèse", "h_exec": "Synthèse exécutive",
        "market": "Marché", "kpi_price": "Prix médian ville", "kpi_yoy": "Évolution 12 mois",
        "kpi_tx": "Transactions / an",
        "th_mode": "Mode", "th_city_score": "Score ville", "th_verdict": "Verdict",
        "th_indicator": "Indicateur", "th_zone": "Freguesia", "th_score": "Score",
        "eyb_modes": "Lecture par mode", "city_view": "Vue ville : score {s}/100, {v}",
        "eyb_risks": "Risques · fiscalité &amp; énergie", "h_risks": "Risques",
        "eyb_conclusion": "Conclusion", "h_reco": "Recommandation",
        "legal": "Document généré par Barzel Analytics à partir de son moteur d'analyse propriétaire.\n"
                 "  Les indicateurs reflètent l'état du marché à la date d'édition. Ce document est destiné à l'usage interne\n"
                 "  du destinataire et ne constitue pas un conseil en investissement.",
    },
    "en": {
        "memo": "Investment memo", "prepared": "Document prepared by the Barzel platform",
        "eyb_summary": "Summary", "h_exec": "Executive summary",
        "market": "Market", "kpi_price": "City median price", "kpi_yoy": "12-month change",
        "kpi_tx": "Transactions / year",
        "th_mode": "Mode", "th_city_score": "City score", "th_verdict": "Verdict",
        "th_indicator": "Indicator", "th_zone": "Freguesia", "th_score": "Score",
        "eyb_modes": "Reading by mode", "city_view": "City view : score {s}/100, {v}",
        "eyb_risks": "Risks · tax &amp; energy", "h_risks": "Risks",
        "eyb_conclusion": "Conclusion", "h_reco": "Recommendation",
        "legal": "Document generated by Barzel Analytics from its proprietary analysis engine.\n"
                 "  The indicators reflect the state of the market at the date of issue. This document is intended for the\n"
                 "  recipient's internal use and does not constitute investment advice.",
    },
    "pt": {
        "memo": "Memorando de investimento", "prepared": "Documento preparado pela plataforma Barzel",
        "eyb_summary": "Síntese", "h_exec": "Síntese executiva",
        "market": "Mercado", "kpi_price": "Preço mediano da cidade", "kpi_yoy": "Evolução a 12 meses",
        "kpi_tx": "Transações / ano",
        "th_mode": "Modo", "th_city_score": "Score da cidade", "th_verdict": "Veredicto",
        "th_indicator": "Indicador", "th_zone": "Freguesia", "th_score": "Score",
        "eyb_modes": "Leitura por modo", "city_view": "Vista cidade : score {s}/100, {v}",
        "eyb_risks": "Riscos · fiscalidade e energia", "h_risks": "Riscos",
        "eyb_conclusion": "Conclusão", "h_reco": "Recomendação",
        "legal": "Documento gerado pela Barzel Analytics a partir do seu motor de análise proprietário.\n"
                 "  Os indicadores refletem o estado do mercado à data de edição. Este documento destina-se ao uso interno\n"
                 "  do destinatário e não constitui aconselhamento de investimento.",
    },
}


def _html(sections: dict, tables: dict, scope: str, asset_class: str,
          modes: list[str], angle: str, today: str, city: str = "gaia",
          lang: str = "fr") -> str:
    from ..services.cities import label_for
    P = _PDF[lang]
    city_label = label_for(city)
    cls_fr = _CLS[lang][asset_class]
    scope_line = tables.get("scope_name") or city_label
    title_scope = f"{scope_line} · {cls_fr}" if scope != "ville" else f"{city_label} · {cls_fr}"
    v = tables["ville"]

    # Two modes per page keeps the memo within 4-6 pages with all four modes.
    mode_blocks = []
    for m in modes:
        t = tables["modes"][m]
        rows_html = "".join(
            f"<tr{' class=scope' if r['is_scope'] else ''}><td>{_esc(r['name'])}"
            f"{' <span class=mark>◆</span>' if r['is_scope'] else ''}</td>"
            f"<td class=val>{r['score']}</td><td>{_badge(r['verdict'], lang)}</td>"
            + "".join(f"<td class=val>{_esc(c)}</td>" for c in r["cols"]) + "</tr>"
            for r in t["rows"]
        )
        muni = t["municipio"]
        muni_line = (P["city_view"].format(s=muni["score"], v=_verdict(muni["verdict"], lang))
                     + (f" · {_esc(muni['native'])}" if muni.get("native") else "")) if muni else ""
        mode_blocks.append(f"""
  <div class="modeblock">
    <h3 class="modetitle">{_MODE[lang][m]}</h3>
    <div class="muni">{muni_line}</div>
    <table>
      <thead><tr><th>{P["th_zone"]}</th><th>{P["th_score"]}</th><th>{P["th_verdict"]}</th>{"".join(f"<th>{h}</th>" for h in t["headers"])}</tr></thead>
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
  <div class="eyebrow">{P["eyb_modes"]}</div>
  {pair}
  <div class="pagefoot">Barzel Analytics · {P["memo"]} · {today}</div>
</section>""")

    facts_html = "".join(
        f'<div class="fact"><div class="fact-t">{k}</div><div class="fact-b">{_rich(t)}</div></div>'
        for k, t in _facts_for_city(city, lang)
    )

    return f"""<!DOCTYPE html><html lang="{lang}"><head><meta charset="utf-8"><style>
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
    <div class="eyebrow" style="letter-spacing:3px">{P["memo"]}</div>
    <h1>{_esc(title_scope)}</h1>
    <div style="margin-top:14px;color:rgba(243,238,227,.85);font-size:11pt">{_angle_label(angle, lang)}</div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;color:rgba(243,238,227,.7);font-size:9.5pt">
    <div>{today}</div><div>{P["prepared"]}</div>
  </div>
</section>

<section class="page">
  <div class="rule"></div>
  <div class="eyebrow">{P["eyb_summary"]}</div>
  <h2>{P["h_exec"]}</h2>
  <div class="narrative">{_paras(sections.get("executive_summary", ""))}</div>
  <div class="eyebrow" style="margin-top:16px">{P["market"]} · {city_label} ({cls_fr})</div>
  <div class="kpis">
    <div class="kpi"><div class="l">{P["kpi_price"]}</div><div class="v">{v["price"]} €/m²</div></div>
    <div class="kpi"><div class="l">{P["kpi_yoy"]}</div><div class="v">{v["yoy"]}</div></div>
    <div class="kpi"><div class="l">{P["kpi_tx"]}</div><div class="v">{v["tx"]}</div></div>
  </div>
  <table>
    <thead><tr><th>{P["th_mode"]}</th><th>{P["th_city_score"]}</th><th>{P["th_verdict"]}</th><th>{P["th_indicator"]}</th></tr></thead>
    <tbody>{"".join(
        f"<tr><td>{_MODE[lang][m]}</td><td class=val>{tables['modes'][m]['municipio']['score'] if tables['modes'][m]['municipio'] else '–'}</td>"
        f"<td>{_badge(tables['modes'][m]['municipio']['verdict'], lang) if tables['modes'][m]['municipio'] else '–'}</td>"
        f"<td>{_esc(tables['modes'][m]['municipio'].get('native', '')) if tables['modes'][m]['municipio'] else ''}</td></tr>"
        for m in modes)}</tbody>
  </table>
  <div class="pagefoot">Barzel Analytics · {P["memo"]} · {today}</div>
</section>

{"".join(mode_pages)}

<section class="page" style="page-break-after:auto">
  <div class="rule"></div>
  <div class="eyebrow">{P["eyb_risks"]}</div>
  <h2>{P["h_risks"]}</h2>
  <div class="narrative">{_paras(sections.get("risques", ""))}</div>
  <div class="factgrid">{facts_html}</div>
  <div class="eyebrow" style="margin-top:14px">{P["eyb_conclusion"]}</div>
  <h2>{P["h_reco"]}</h2>
  <div class="narrative">{_paras(sections.get("recommandation", ""))}</div>
  <div class="legal">{P["legal"]}</div>
  <div class="pagefoot">Barzel Analytics · {P["memo"]} · {today}</div>
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
    asset_class, modes, scope, city = _validate(payload)
    lang = _lang_of(payload)
    if not isinstance(payload.sections, dict):
        raise HTTPException(status_code=400, detail="sections invalides")
    tables = _tables(scope, asset_class, modes, city, lang)    # chiffres du moteur, jamais du client
    d = date.today()
    today = _today_str(d, lang)
    html = _html(_sanitize_sections(payload.sections), tables, scope, asset_class, modes, payload.angle, today, city, lang)
    try:
        pdf = _pdf_bytes(html)
    except Exception as exc:  # noqa: BLE001
        log.warning("memo render failed: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="rendu momentanément indisponible")
    from ..services.cities import label_for
    # Nom de fichier : marque « Barzel_Memo_ » conservée, ville en ASCII (elle ne se
    # traduit pas), classe dans la langue demandée mais DÉSACCENTUÉE (un en-tête
    # Content-Disposition ne porte pas d'accent sans encodage RFC 5987). En FR le
    # nom est donc strictement celui d'avant le lot.
    city_file = "".join(ch for ch in label_for(city) if ch.isalnum())
    fname = f"Barzel_Memo_{city_file}_{_CLS_FILE[lang][asset_class]}_{d.isoformat()}.pdf"
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{fname}"'})
