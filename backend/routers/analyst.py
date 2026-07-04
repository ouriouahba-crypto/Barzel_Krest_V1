"""IA Analyste : POST /api/analyst/ask.

SÉCURITÉ ABSOLUE : le contexte envoyé au modèle est construit EXCLUSIVEMENT à
partir des payloads passés par _clean() (les mêmes que les endpoints publics),
jamais params.json, jamais les indices de confiance, jamais la notion de
simulation, plus les faits statiques déjà publiés par les pages Fiscalité et
Énergie. La clé Anthropic est lue de backend/.env (jamais commitée).
"""

from __future__ import annotations

import logging
import math
import os
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import mode_scoring as ms
from .scoring import _clean

log = logging.getLogger("routers.analyst")

router = APIRouter(prefix="/api/analyst", tags=["analyst"])

_MODEL = "claude-sonnet-4-6"
_MAX_TOKENS = 800

_CLASSES = {"residential", "office", "hotel", "logistics", "retail"}
_CLS_FR = {"residential": "résidentiel", "office": "bureaux", "hotel": "hôtellerie",
           "logistics": "logistique", "retail": "commerce"}


def _api_key() -> str | None:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        return key
    env = Path(__file__).resolve().parent.parent / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("ANTHROPIC_API_KEY="):
                return line.split("=", 1)[1].strip() or None
    return None


# --------------------------------------------------------------------------- #
# Context : cleaned scoring payloads compacted into terse tables               #
# --------------------------------------------------------------------------- #

def _pillar(z: dict, key: str) -> dict:
    return next((p for p in z["pillars"] if p["pillar"] == key), {})


def _ri(v) -> int:
    """Half-up integer rounding, the platform's score convention (Math.round).
    Python's round() half-to-even would turn 86.5 into 86 while every page
    shows 87 ; scores are quoted as integers everywhere, this is the one way."""
    return int(math.floor(float(v) + 0.5))


# Verdict ladders per mode (raw engine strings) + display accents for the LLM.
_VERDICT_LADDER = {
    "promotion": ["Go", "Conditionnel", "Passer"],
    "detention": ["Conserver", "Surveiller", "Ceder"],
    "arbitrage": ["Fenetre ouverte", "Fenetre etroite", "Fenetre fermee"],
    "landbank": ["Prioritaire", "A phaser", "En attente"],
}
_VERDICT_ACCENT = {"Ceder": "Céder", "Fenetre ouverte": "Fenêtre ouverte",
                   "Fenetre etroite": "Fenêtre étroite", "Fenetre fermee": "Fenêtre fermée",
                   "A phaser": "À phaser"}
_MODE_FR_CTX = {"promotion": "promotion", "detention": "détention",
                "arbitrage": "arbitrage", "landbank": "landbank"}


@lru_cache(maxsize=16)
def verdict_counts(asset_class: str, city: str = "gaia") -> dict:
    """Pre-computed freguesia counts per mode and verdict, from cleaned payloads.
    Injected into the LLM context (analyst + memo) so the model never counts by
    itself, and reused by the memo's post-generation count check."""
    out: dict = {}
    for mode in ms.MODES:
        zones = _clean(ms.score_city(city, mode, asset_class))
        fregs = [z for z in zones if z["level"] == "freguesia"]
        out[mode] = {v: sum(1 for z in fregs if z["verdict"] == v)
                     for v in _VERDICT_LADDER[mode]}
    return out


def _counts_block(asset_class: str, city: str = "gaia") -> list[str]:
    counts_by_mode = verdict_counts(asset_class, city)
    n_freg = sum(next(iter(counts_by_mode.values())).values()) if counts_by_mode else 0
    lines = [f"## DÉNOMBREMENTS (comptages exacts sur les {n_freg} freguesias ; utilise UNIQUEMENT "
             "ces comptages, ne recompte JAMAIS toi-même à partir des listes)"]
    for mode, counts in counts_by_mode.items():
        parts = ", ".join(f"{_VERDICT_ACCENT.get(v, v)} {n}" for v, n in counts.items())
        lines.append(f"- {_MODE_FR_CTX[mode]} : {parts}, total {n_freg} freguesias")
    return lines


_EM_DASH = "\u2014"


def strip_em_dashes(text: str) -> str:
    """Filet anti-cadratin sur les sorties IA (analyste + mémo) : « espace,
    cadratin, espace » devient une virgule, puis tout U+2014 résiduel aussi.
    L'interdiction figure déjà dans les prompts système ; ceci est le filet,
    appliqué avant tout affichage ou rendu PDF (sanitize, jamais de rejet)."""
    if not text or _EM_DASH not in text:
        return text
    text = text.replace(f" {_EM_DASH} ", ", ").replace(_EM_DASH, ", ")
    return text.replace("  ", " ")


def _fmt(v, digits=1):
    if v is None:
        return "n/d"
    if isinstance(v, float):
        # Arrondi half-up de la plateforme, et jamais de zéro négatif (« -0.0 »).
        r = math.floor(v * 10 ** digits + 0.5) / 10 ** digits
        if r == 0:
            r = 0.0
        return f"{r:.{digits}f}"
    return str(v)


def _mode_block(mode: str, zones: list[dict]) -> list[str]:
    """One compact line per zone, from CLEANED payloads only."""
    out = [f"## MODE {mode.upper()}"]
    for z in zones:
        name = z["zone_name"].replace("União das freguesias de ", "")
        lvl = "ville" if z["level"] == "municipio" else "freguesia"
        head = f"- {name} ({lvl}) : score {_ri(z['total'])}/100, verdict {z['verdict']}"
        if mode == "promotion":
            b = _pillar(z, "marge").get("breakdown") or {}
            out.append(head + f", marge {_fmt(b.get('margin_pct'))}%, prix neuf réalisable "
                              f"{_fmt(b.get('realizable_sale'), 0)} €/m² (construction {_fmt(b.get('construction'), 0)}, "
                              f"foncier {_fmt(b.get('land'), 0)}, coût total {_fmt(b.get('cost_total'), 0)} €/m²)"
                       + (f", prime neuf {_fmt(b.get('premium_pct'), 0)}%" if b.get("premium_pct") is not None else ""))
        elif mode == "detention":
            b = _pillar(z, "rendement_net").get("breakdown") or {}
            out.append(head + f", loyer de marché {_fmt(b.get('loyer_marche_eur_m2_an'), 0)} €/m²/an, "
                              f"yield brut {_fmt(b.get('yield_brut_pct'), 2)}%, charges {_fmt(b.get('charges_pct_loyer'))}% du loyer, "
                              f"fiscalité {_fmt(b.get('fiscalite_pct_loyer'))}% du loyer, yield net {_fmt(b.get('yield_net_pct'), 2)}%")
        elif mode == "arbitrage":
            b = _pillar(z, "spread").get("breakdown") or {}
            out.append(head + f", valeur réalisable {_fmt(b.get('valeur_realisable_eur_m2'), 0)} €/m², "
                              f"spread {_fmt(b.get('spread_pct'))}% vs médiane Gaia {_fmt(b.get('prix_marche_eur_m2'), 0)} €/m², "
                              f"délai de cession {_fmt(b.get('delai_cession_mois'))} mois, frais {_fmt(b.get('frais_cession_pct'))}%, "
                              f"décote {_fmt(b.get('decote_negociation_pct'))}%")
        else:  # landbank
            b = _pillar(z, "constructibilite").get("breakdown") or {}
            out.append(head + f", constructibilité {_fmt(b.get('constructibilite'), 0)}/100, "
                              f"meilleur usage {b.get('meilleur_usage', 'n/d')}, valeur résiduelle {_fmt(b.get('valeur_residuelle_eur_m2'), 0)} €/m² "
                              f"vs foncier marché {_fmt(b.get('foncier_marche_eur_m2'), 0)} €/m² (uplift {_fmt(b.get('uplift_pct'))}%), "
                              f"horizon d'activation : {b.get('horizon_activation', 'n/d')}")
    return out


# Faits statiques : strictement ceux déjà publiés par les pages Fiscalité/Énergie.
_FACTS_FISCAL = """## FISCALITÉ PORTUGAL 2026 (barèmes officiels, tels qu'affichés par la plateforme)
- Acquisition : IMT habitation (investisseur) barème progressif 1%→8%, taux uniques 6% (660 982 – 1 150 853 €) et 7,5% au-delà ; commercial et terrains à bâtir 6,5% ; Imposto do Selo 0,8%. Non-résidents (résidentiel, dès 01/09/2026) : taux fixe 7,5% (DL 97/2026), remboursable si résidence fiscale sous 2 ans ou location ≤ 2 300 €/mois.
- Détention : IMI 0,30–0,45%/an sur la VPT (taux communal) ; AIMI 0,4% (patrimoine résidentiel en société) ; IRC sur loyers nets 19% (+ derramas).
- Cession : plus-values en IRC 19% + derrama municipale (≤1,5%) et estadual → taux effectif ~21%, celui des verdicts de la plateforme.
- Frais d'entrée type : ~5,6% à 400 k€, ~8,3% à 1,5 M€ (résidentiel investisseur) ; 7,3% en commercial."""

_FACTS_ENERGY_COMMON = """## ÉNERGIE (EPBD (UE) 2024/1275 · SCE portugais DL 101-D/2020, classes A+ → F)
- Échéances : transposition 29/05/2026 ; neuf public zéro émission 2028, tout le neuf 2030 ; non-résidentiel : les 16% les moins performants rénovés d'ici 2030, 26% d'ici 2033 ; résidentiel : énergie primaire moyenne −16% (2030), −20 à 22% (2035) ; sortie des chaudières fossiles 2040.
- Le risque énergétique est déjà compté dans les verdicts de détention (pilier énergie de la cascade Rendement)."""

_FACTS_ENERGY_GAIA = """- Parc résidentiel de Gaia en classes E-F (part la plus basse du parc, exposée aux MEPS) : Santa Marinha 38% (centre historique, la plus exposée), Oliveira do Douro 30%, Mafamude 28%, Avintes 26%, Grijó 26%, Sandim 26%, Serzedo 25%, Pedroso 24%, São Félix 24%, Arcozelo 22%, Gulpilhares 21%, Canelas 19%, Madalena 18%, Vilar de Andorinho 16%, Canidelo 14%.
- Mise à niveau énergétique (coûts types, €/m² habitable) : F→C ~270 €/m², E→C ~200 €/m², C→B +180 €/m². Sur un actif type de Santa Marinha (2 725 €/m², loyer inchangé), F→C comprime le yield net d'environ 0,31 point la première décennie (3,49% → 3,18%)."""


_FACTS_ENERGY_LISBONNE = """- Parc résidentiel de Lisbonne en classes E-F (exposé aux MEPS) : centre historique 45-55% (Santa Maria Maior 52%, Misericórdia 49%, São Vicente 47%, Ajuda 46%), Avenidas Novas/Alvalade/Areeiro 25-35%, périphéries 20-30% (classes C-D dominantes), Parque das Nações 6% (A/B dominants, parc récent)."""

_FACTS_AL_LISBONNE = """## LOCATION COURTE DURÉE (AL) · LISBONNE
- Le centre historique (Santa Maria Maior, Misericórdia) est en zone de contention : la pression réglementaire municipale sur l'alojamento local rend le yield facial touristique non représentatif d'une détention institutionnelle. Les verdicts de détention de la plateforme intègrent cette fragilité (rotation lente, marché locatif contractuel étroit) : yields affichés élevés, verdict Céder."""

_FACTS_FLOOR_LISBONNE = """## PLANCHER DE RENDEMENT INSTITUTIONNEL (détention) · LISBONNE
- Sous 3,0% de yield net, la détention n'est plus justifiée, quelle que soit la profondeur du marché : le verdict plafonne à Surveiller même quand le score de marché reste élevé (c'est un plafond de doctrine, pas un malus de score). C'est le cas du produit récent au net comprimé, Parque das Nações et Avenidas Novas : le rendement ne justifie plus la détention. Quand la fenêtre d'arbitrage est ouverte au même endroit (voir le mode arbitrage, Parque das Nações), la lecture institutionnelle est une rotation : céder dans la fenêtre plutôt que détenir sous le plancher."""


def _facts_for(city: str) -> str:
    """Faits statiques : fiscalité PT + énergie EPBD communes ; parc SCE et
    clauses locales par ville (Gaia : parc simulé + retrofit ; Lisbonne :
    parc curé + clause AL du centre historique)."""
    if city == "gaia":
        return "\n\n".join([_FACTS_FISCAL, _FACTS_ENERGY_COMMON, _FACTS_ENERGY_GAIA])
    if city == "lisbonne":
        return "\n\n".join([_FACTS_FISCAL, _FACTS_ENERGY_COMMON, _FACTS_ENERGY_LISBONNE,
                            _FACTS_AL_LISBONNE, _FACTS_FLOOR_LISBONNE])
    return "\n\n".join([_FACTS_FISCAL, _FACTS_ENERGY_COMMON])


@lru_cache(maxsize=16)
def _build_context(asset_class: str, city: str = "gaia") -> str:
    from ..services.cities import label_for
    lines: list[str] = [
        f"# DONNÉES BARZEL · {label_for(city).upper()} · CLASSE {_CLS_FR.get(asset_class, asset_class).upper()}",
        "(scores /100 ; verdicts par mode : promotion Go/Conditionnel/Passer, détention Conserver/Surveiller/Céder, "
        "arbitrage Fenêtre ouverte/étroite/fermée, landbank Prioritaire/À phaser/En attente)",
    ]
    for mode in ms.MODES:
        zones = _clean(ms.score_city(city, mode, asset_class))
        zones.sort(key=lambda z: z["total"], reverse=True)
        lines += _mode_block(mode, zones)
    lines += _counts_block(asset_class, city)
    if city == "gaia" and asset_class == "residential":
        lines.append(_haya_block())
    if city == "lisbonne" and asset_class == "residential":
        lines.append(_fabrica_block())
    lines.append(_facts_for(city))
    return "\n".join(lines)


def _haya_block() -> str:
    """The K-REST flagship asset, from the same cleaned asset payload the
    platform serves (Prix & marge page)."""
    try:
        a = _clean(ms.score_asset("haya"))
        promo = a["scores"]["promotion"]
        b = next(p for p in promo["pillars"] if p["pillar"] == "marge").get("breakdown") or {}
        return ("## ACTIF K-REST · HAYA TOWERS (Santa Marinha e São Pedro da Afurada, résidentiel, promotion)\n"
                f"- Prix de vente réalisable {b.get('realizable_sale')} €/m² "
                f"(prime +{round(b.get('premium_over_median_pct') or 0)}% sur la médiane réelle de la freguesia), "
                f"construction {b.get('construction')} €/m², foncier {b.get('land')} €/m², "
                f"marge promoteur {b.get('margin_pct')}%, score promotion {_ri(promo['total'])}/100, verdict {promo['verdict']}.")
    except Exception:  # noqa: BLE001 ; l'actif est optionnel dans le contexte
        return ""


def _fabrica_block() -> str:
    """L'actif vedette lisboète, depuis le même payload nettoyé que la page
    Prix & marge (miroir du bloc Haya de Gaia)."""
    try:
        a = _clean(ms.score_asset("fabrica", city="lisbonne"))
        promo = a["scores"]["promotion"]
        b = next(p for p in promo["pillars"] if p["pillar"] == "marge").get("breakdown") or {}
        return ("## ACTIF K-REST · FÁBRICA ORIENTE (Marvila, résidentiel, promotion, reconversion de friche industrielle, 14 000 m² constructibles)\n"
                f"- Prix de sortie visé {b.get('realizable_sale')} €/m² "
                f"(prime +{round(b.get('premium_over_median_pct') or 0)}% sur la médiane réelle de la freguesia), "
                f"construction (coque + finitions) {b.get('construction')} €/m², foncier {b.get('land')} €/m², "
                f"marge promoteur {b.get('margin_pct')}%, score promotion {_ri(promo['total'])}/100, verdict {promo['verdict']}.")
    except Exception:  # noqa: BLE001 ; l'actif est optionnel dans le contexte
        return ""


def _system_for(city: str, asset_class: str) -> str:
    from ..services.cities import label_for
    label = label_for(city)
    counts_by_mode = verdict_counts(asset_class, city)
    n_freg = sum(next(iter(counts_by_mode.values())).values()) if counts_by_mode else 15
    return _SYSTEM_TEMPLATE.replace("{VILLE}", label).replace("{NFREG}", str(n_freg))


_SYSTEM_TEMPLATE = """Tu es l'analyste de Barzel Analytics, plateforme d'intelligence immobilière couvrant {VILLE} (Portugal) pour un investisseur institutionnel.

RÈGLES ABSOLUES :
- Tu réponds UNIQUEMENT à partir des données fournies dans le message (scores, verdicts, métriques, faits fiscaux et énergétiques). Tu n'inventes JAMAIS un chiffre : chaque nombre cité doit figurer tel quel dans les données.
- Tu cites les freguesias par leur nom et les chiffres exacts (mêmes décimales que les données quand c'est utile). Exception : les scores se citent toujours en entiers (« 87/100 »), jamais avec décimale.
- {VILLE} compte {NFREG} freguesias (la ligne « ville » est l'agrégat municipal, pas une de plus). Ces territoires s'appellent des freguesias ; n'emploie jamais d'autre terme (jamais « friches », « quartiers » ou « communes »).
- Tu ne mentionnes JAMAIS de niveau de confiance, de source de donnée, de méthodologie interne ni l'idée qu'une donnée serait simulée ou estimée. Si l'on t'interroge sur l'origine ou la nature des données : « la plateforme agrège des données de marché et son modèle propriétaire Barzel », sans autre détail.
- Si la question sort de Vila Nova de Gaia ou du périmètre immobilier de la plateforme, réponds avec élégance que c'est hors du périmètre couvert par la plateforme sur {VILLE}, et propose ce que tu peux couvrir.
- Ponctuation : tu n'utilises JAMAIS le tiret cadratin (le tiret long, U+2014), ni seul ni encadré d'espaces ; articule avec deux-points, virgule, parenthèses ou une nouvelle phrase.
- Ton sobre et professionnel, en français. Réponses courtes : 5 à 10 lignes, en texte simple, JAMAIS de markdown (pas de titres, pas de gras, pas de puces), des phrases.
- Avant de conclure, vérifie la cohérence interne de ta réponse : n'affirme jamais qu'un territoire domine sur tous les axes si un seul axe s'inverse ; dans ce cas, nomme l'exception d'emblée.
- Pour tout comptage de freguesias (« N freguesias »), utilise UNIQUEMENT les comptages pré-calculés de la section DÉNOMBREMENTS ; ne recompte JAMAIS toi-même à partir des listes ; au moindre doute, formule sans compte. Ne cite un rang (« premier », « deuxième ») que s'il se lit directement dans l'ordre des données.
- Quand la question s'y prête, conclus par un verdict actionnable en une phrase (celui des données : Go/Conditionnel/Passer, Conserver/Surveiller/Céder, Fenêtre ouverte/étroite/fermée, Prioritaire/À phaser/En attente)."""


class AskPayload(BaseModel):
    question: str
    asset_class: str = "residential"
    city: str = "gaia"


@router.post("/ask")
def ask(payload: AskPayload) -> dict:
    question = (payload.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="question vide")
    if len(question) > 600:
        raise HTTPException(status_code=400, detail="question trop longue")
    asset_class = payload.asset_class if payload.asset_class in _CLASSES else "residential"
    from ..services.cities import resolve_slug
    city = resolve_slug(payload.city)

    key = _api_key()
    if not key:
        raise HTTPException(status_code=503, detail="analyste momentanément indisponible")

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=key)
        message = client.messages.create(
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            temperature=0.2,  # réponses stables en démo
            system=_system_for(city, asset_class),
            messages=[{
                "role": "user",
                "content": f"{_build_context(asset_class, city)}\n\n# QUESTION\n{question}",
            }],
        )
        answer = "".join(b.text for b in message.content if getattr(b, "type", "") == "text").strip()
        return {"answer": strip_em_dashes(answer), "asset_class": asset_class}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 ; sober failure, never leak internals
        log.warning("analyst call failed: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="analyste momentanément indisponible")
