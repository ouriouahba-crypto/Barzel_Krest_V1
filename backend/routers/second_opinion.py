"""IA Contre-analyse (Second Opinion) : POST /api/second-opinion/*.

On soumet un DOCUMENT EXTERNE (argumentaire de broker en PDF, note de conseil en
PPTX) recu par l'investisseur, plus ses consignes ; le modele produit une
contre-analyse en confrontant le document aux donnees Barzel de la ville.

Deux endpoints :
- POST /extract (multipart) : extrait le texte des fichiers (PDF via pypdf, PPTX
  via python-pptx). Le front stocke ce texte dans la conversation (localStorage).
- POST /analyze (JSON) : recoit le texte du document + l'historique metier de la
  conversation (continuation consciente, backend sans etat) et renvoie l'analyse.

SECURITE : le contexte Barzel et les garde-fous sont EXACTEMENT ceux de l'analyste
(memes fonctions importees, aucune duplication), plus le texte du document fourni
par l'utilisateur. Jamais de simulation, jamais params.json, maille par pays, zero
tiret cadratin (filet strip_em_dashes). Cle Anthropic lue de backend/.env.
"""

from __future__ import annotations

import io
import logging

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..services.cities import label_for
from .analyst import (
    _MODEL,
    _LANG_NAME,
    _VERDICT_VOCAB,
    _api_key,
    _build_context,
    _norm_lang,
    _require_city,
    _require_class,
    mesh_for,
    strip_em_dashes,
)

log = logging.getLogger("routers.second_opinion")

router = APIRouter(prefix="/api/second-opinion", tags=["second-opinion"])

_MAX_TOKENS = 1800  # analyse complete, plus longue que l'analyste courant
_MAX_FILES = 3
_MAX_BYTES = 20 * 1024 * 1024  # 20 Mo par fichier
_MAX_DOC_CHARS = 60_000  # borne du texte extrait (envoi LLM + stockage front)


# --------------------------------------------------------------------------- #
# Extraction : PDF (pypdf) + PPTX (python-pptx)                                #
# --------------------------------------------------------------------------- #

def _extract_pdf(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    parts: list[str] = []
    for page in reader.pages:
        try:
            parts.append(page.extract_text() or "")
        except Exception:  # noqa: BLE001 ; une page illisible ne casse pas l'extraction
            continue
    return "\n".join(parts).strip()


def _extract_pptx(data: bytes) -> str:
    from pptx import Presentation

    prs = Presentation(io.BytesIO(data))
    parts: list[str] = []
    for i, slide in enumerate(prs.slides, 1):
        texts: list[str] = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    line = "".join(run.text for run in para.runs).strip()
                    if line:
                        texts.append(line)
            if shape.has_table:
                for row in shape.table.rows:
                    cells = [c.text.strip() for c in row.cells]
                    if any(cells):
                        texts.append(" | ".join(cells))
        if texts:
            parts.append(f"[Diapositive {i}]\n" + "\n".join(texts))
    return "\n\n".join(parts).strip()


def _extract_one(filename: str, data: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        return _extract_pdf(data)
    if name.endswith(".pptx"):
        return _extract_pptx(data)
    raise HTTPException(status_code=400, detail=f"format non supporte : {filename!r} (PDF ou PPTX)")


@router.post("/extract")
async def extract(files: list[UploadFile] = File(...)) -> dict:
    if not files:
        raise HTTPException(status_code=400, detail="aucun fichier")
    if len(files) > _MAX_FILES:
        raise HTTPException(status_code=400, detail=f"maximum {_MAX_FILES} fichiers")
    blocks: list[str] = []
    names: list[str] = []
    for f in files:
        data = await f.read()
        if len(data) > _MAX_BYTES:
            raise HTTPException(status_code=400, detail=f"fichier trop volumineux : {f.filename!r}")
        text = _extract_one(f.filename or "", data)
        names.append(f.filename or "document")
        blocks.append(f"### DOCUMENT : {f.filename}\n{text}" if text
                      else f"### DOCUMENT : {f.filename}\n(aucun texte extractible)")
    doc_text = "\n\n".join(blocks)[:_MAX_DOC_CHARS]
    return {"doc_text": doc_text, "doc_names": names, "chars": len(doc_text)}


# --------------------------------------------------------------------------- #
# Analyse : document + consignes croises au contexte Barzel                    #
# --------------------------------------------------------------------------- #

class Turn(BaseModel):
    role: str
    text: str


class AnalyzePayload(BaseModel):
    doc_text: str = ""
    messages: list[Turn] = []  # historique metier ; messages[0] = consignes de l'investisseur
    asset_class: str = "residential"
    city: str | None = None
    lang: str = "fr"


_SYSTEM_TEMPLATE = """Tu es l'analyste de Barzel Analytics, plateforme d'intelligence immobiliere couvrant {VILLE} pour un investisseur institutionnel.

On te soumet un DOCUMENT EXTERNE (argumentaire d'un broker, note d'un conseil, dossier de vente) recu par l'investisseur, accompagne de ses consignes (questions, intentions, recommandations). Ta mission : produire une CONTRE-ANALYSE, en confrontant les affirmations du document aux donnees Barzel de {VILLE}.

REGLES ABSOLUES :
- Ta reference chiffree est la section DONNEES BARZEL. Tu n'inventes JAMAIS un chiffre cote Barzel : chaque nombre Barzel cite figure tel quel dans les donnees. Les scores se citent en entiers (« 87/100 »).
- Tu peux reprendre les chiffres AVANCES PAR LE DOCUMENT, mais tu les attribues clairement a lui (« le broker avance ... », « le dossier annonce ... ») et tu les CONFRONTES aux donnees Barzel : ecart, coherence, angle mort, risque non dit, hypothese optimiste.
- Tu nommes les {MESH_PL} concernees. Tu ne mentionnes JAMAIS de niveau de confiance, de source, de methodologie interne, ni l'idee qu'une donnee Barzel serait simulee ou estimee.
- Si le document sort du perimetre de {VILLE} ou de l'immobilier couvert par la plateforme, dis-le avec elegance et traite ce qui est couvrable.
- Ponctuation : JAMAIS de tiret cadratin (le tiret long, U+2014), ni seul ni encadre d'espaces ; articule avec deux-points, virgule, parentheses ou une nouvelle phrase.
- Rediges TOUTE ta reponse en {LANG_NAME}, ton sobre et professionnel. Analyse structuree en paragraphes (PAS de markdown : pas de titres, pas de gras, pas de puces), plus developpee que l'analyste courant mais sans remplissage : concentre-toi sur les ecarts et les risques qui comptent pour la decision.
- Reponds en priorite aux consignes explicites de l'investisseur.
- Termine par une recommandation actionnable en une ou deux phrases, avec le verdict Barzel pertinent. Emploie EXACTEMENT ces libelles de verdict, dans la langue de reponse : {VERDICT_VOCAB}."""


def _system_for(city: str, lang: str) -> str:
    return (_SYSTEM_TEMPLATE
            .replace("{VILLE}", label_for(city))
            .replace("{MESH_PL}", mesh_for(city)[1])
            .replace("{LANG_NAME}", _LANG_NAME[lang])
            .replace("{VERDICT_VOCAB}", _VERDICT_VOCAB[lang]))


@router.post("/analyze")
def analyze(payload: AnalyzePayload) -> dict:
    asset_class = _require_class(payload.asset_class)
    city = _require_city(payload.city)
    lang = _norm_lang(payload.lang)
    doc_text = (payload.doc_text or "").strip()[:_MAX_DOC_CHARS]
    turns = payload.messages
    if not turns or turns[0].role != "user":
        raise HTTPException(status_code=400, detail="conversation vide ou mal formee")
    if not doc_text:
        raise HTTPException(status_code=400, detail="document manquant")

    key = _api_key()
    if not key:
        raise HTTPException(status_code=503, detail="contre-analyse momentanement indisponible")

    # 1er message : contexte Barzel + document + consignes initiales (turns[0]).
    # Tours suivants : l'historique metier tel quel (le doc reste dans le 1er message).
    msgs: list[dict] = [{
        "role": "user",
        "content": (f"{_build_context(asset_class, city)}\n\n"
                    f"# DOCUMENT EXTERNE\n{doc_text}\n\n"
                    f"# CONSIGNES DE L'INVESTISSEUR\n{turns[0].text}"),
    }]
    for turn in turns[1:]:
        msgs.append({"role": "assistant" if turn.role == "assistant" else "user", "content": turn.text})

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=key)
        message = client.messages.create(
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            temperature=0.2,
            system=_system_for(city, lang),
            messages=msgs,
        )
        answer = "".join(b.text for b in message.content if getattr(b, "type", "") == "text").strip()
        return {"answer": strip_em_dashes(answer)}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 ; echec sobre, aucune fuite d'interne
        log.warning("second-opinion call failed: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="contre-analyse momentanement indisponible")
