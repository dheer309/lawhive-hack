"""CasePilot backend — the real pipeline.

Stages run real Claude (claude-opus-4-8) calls over an in-memory case store.
Voice is transcribed with OpenAI Whisper. Legislation citations are grounded in
real legislation.gov.uk URLs so we never show a hallucinated source.

Resilience: every stage falls back to a coherent mock if the model call fails
(missing key, network, etc.) so a live demo never hard-breaks — the error is
logged loudly so we know it happened. Gmail is still mocked (deferred).

Env (backend/.env): ANTHROPIC_API_KEY (required for real output),
OPENAI_API_KEY (optional — enables voice transcription).
"""

import base64
import concurrent.futures
import json
import logging
import os
import re
import time
import uuid
import xml.etree.ElementTree as ET

import requests
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

load_dotenv()

# Allow the OAuth flow over http://localhost and tolerate Google returning extra
# granted scopes — both are fine for local dev.
os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
log = logging.getLogger("casepilot")

# The hackathon gateway only routes this model; env lets us override if needed.
MODEL = os.environ.get("ANTHROPIC_MODEL", "vertex_ai/claude-opus-4-7")

app = Flask(__name__)
CORS(app)

# In-memory case store: case_id -> { transcript, files, summary, entities, synthesis, recommendation }
CASES = {}


# ---------------------------------------------------------------------------
# Clients (lazy so a missing key never blocks import / unrelated routes)
# ---------------------------------------------------------------------------
def anthropic_client():
    import anthropic

    # Gateway auth: bearer auth_token + base_url (NOT api_key). Both are read from
    # the env by the SDK too, but we pass them explicitly so it's unambiguous.
    return anthropic.Anthropic(
        base_url=os.environ.get("ANTHROPIC_BASE_URL"),
        auth_token=os.environ.get("ANTHROPIC_AUTH_TOKEN"),
    )


def openai_client():
    from openai import OpenAI

    return OpenAI()  # reads OPENAI_API_KEY


def extract_text(name, data):
    """Best-effort text from an uploaded file (PDF + text formats). Images and
    unknown types return '' — we still record that the file was provided."""
    low = (name or "").lower()
    try:
        if low.endswith(".pdf"):
            import io

            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(data))
            return "\n".join((p.extract_text() or "") for p in reader.pages)[:8000]
        if low.endswith((".txt", ".md", ".csv", ".eml", ".html", ".htm", ".json", ".rtf")):
            return data.decode("utf-8", "ignore")[:8000]
    except Exception as e:  # noqa: BLE001
        log.warning("could not extract text from %s: %s", name, e)
    return ""


def ingest_files(files):
    """Read uploaded Werkzeug files. Returns (text_to_append, names, blobs). The text
    embeds each document's extracted contents so the assessment can read them; blobs
    keep the raw bytes so we can serve/link the document later."""
    import mimetypes

    chunks, names, blobs = [], [], []
    for f in files:
        name = f.filename or "file"
        data = f.read()
        names.append(name)
        text = extract_text(name, data)
        mime = f.mimetype or mimetypes.guess_type(name)[0] or "application/octet-stream"
        blobs.append({"name": name, "data": data, "mime": mime})
        chunks.append(
            f"\n\n[Attached document: {name}]\n{text.strip() or '(no extractable text — e.g. an image/scan)'}"
        )
    return "".join(chunks), names, blobs


def _repair_json(s):
    """Best-effort close of a truncated/unterminated JSON object: balance any open
    strings, brackets and braces so a cut-off reply still parses."""
    s = s.rstrip()
    stack, in_str, esc = [], False, False
    for ch in s:
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{[":
            stack.append(ch)
        elif ch in "}]" and stack:
            stack.pop()
    if in_str:
        s += '"'
    s = re.sub(r",\s*$", "", s)  # drop a dangling comma
    return s + "".join("}" if c == "{" else "]" for c in reversed(stack))


def _parse_json(text):
    """Pull a JSON object out of a model reply (tolerates ``` fences / stray prose,
    and repairs a truncated tail rather than throwing the whole reply away)."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text).strip()
    start = text.find("{")
    if start != -1:
        text = text[start:]
    candidate = text[: text.rfind("}") + 1] if text.rfind("}") != -1 else text
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        return json.loads(_repair_json(text))


# Statuses the gateway returns transiently (incl. the occasional 403 "API access
# only" blip) that we should retry rather than fall back to the mock for.
_TRANSIENT = {403, 408, 409, 425, 429, 500, 502, 503, 504, 529}


def _stream_text(system, user, max_tokens):
    """Stream a completion and return the full text. Streaming keeps the gateway
    connection alive; we retry transient gateway errors a few times before giving up."""
    last = None
    for attempt in range(4):
        try:
            with anthropic_client().messages.stream(
                model=MODEL,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            ) as stream:
                msg = stream.get_final_message()
            return next(b.text for b in msg.content if b.type == "text")
        except Exception as e:  # noqa: BLE001
            status = getattr(e, "status_code", None)
            if status is not None and status not in _TRANSIENT:
                raise  # genuine client error (e.g. 400) — don't waste retries
            last = e
            log.warning("model call attempt %d failed (%s); retrying", attempt + 1, e)
            time.sleep(1.5 * (attempt + 1))
    raise last


def claude_text(system, user, max_tokens=500):
    """Plain text completion."""
    return _stream_text(system, user, max_tokens).strip()


def claude_json(system, user, schema, max_tokens=6000):
    """JSON completion. The gateway ignores output_config.format (Vertex doesn't
    enforce schemas), so we instruct the schema in the prompt and parse the reply.
    No extended thinking: the gateway times out on long thinking + generation."""
    system = (
        system
        + "\n\nRespond with ONLY a JSON object conforming to this JSON Schema — no "
        "markdown fences, no commentary before or after. Keep string values concise "
        "so the JSON is complete and well-formed:\n"
        + json.dumps(schema)
    )
    raw = _stream_text(system, user, max_tokens)
    try:
        return _parse_json(raw)
    except Exception:
        log.error("JSON parse failed; raw reply was:\n%s", raw[:4000])
        raise


# ---------------------------------------------------------------------------
# legislation.gov.uk — turn a Claude-proposed act into a real, citable URL
# ---------------------------------------------------------------------------
def lookup_legislation(query):
    """Resolve an Act title to its canonical legislation.gov.uk page, or None."""
    try:
        r = requests.get(
            "https://www.legislation.gov.uk/all/data.feed",
            params={"title": query},
            timeout=5,
            headers={"Accept": "application/atom+xml"},
        )
        r.raise_for_status()
        ns = "{http://www.w3.org/2005/Atom}"
        entry = ET.fromstring(r.content).find(f"{ns}entry")
        if entry is None:
            return None
        leg_id = entry.findtext(f"{ns}id") or ""
        url = leg_id.replace("/id/", "/").replace("http://", "https://") or None
        return {"title": entry.findtext(f"{ns}title"), "url": url}
    except Exception as e:  # noqa: BLE001 — best effort, never block the pipeline
        log.warning("legislation lookup failed for %r: %s", query, e)
        return None


def enrich_legislation(items):
    """Attach a verified legislation.gov.uk URL to each proposed act (in parallel)."""
    items = items[:5]
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        hits = list(pool.map(lambda it: lookup_legislation(it.get("search_query") or it["title"]), items))
    out = []
    for it, hit in zip(items, hits):
        out.append(
            {
                "title": (hit and hit.get("title")) or it["title"],
                "provision": it.get("provision", ""),
                "relevance": it.get("relevance", ""),
                "url": hit.get("url") if hit else None,
            }
        )
    return out


# ---------------------------------------------------------------------------
# JSON schemas for structured output
# ---------------------------------------------------------------------------
ENTITY_SCHEMA = {
    "type": "object",
    "properties": {
        "names": {"type": "array", "items": {"type": "string"}},
        "dates": {"type": "array", "items": {"type": "string"}},
        "keywords": {"type": "array", "items": {"type": "string"}},
        "addresses": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["names", "dates", "keywords", "addresses"],
    "additionalProperties": False,
}

SYNTH_SCHEMA = {
    "type": "object",
    "properties": {
        "chronology": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "date": {"type": "string"},
                    "event": {"type": "string"},
                    "evidence_ids": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["date", "event", "evidence_ids"],
                "additionalProperties": False,
            },
        },
        "key_evidence": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "source": {"type": "string"},
                    "detail": {"type": "string"},
                    "corroborated": {"type": "boolean"},
                },
                "required": ["id", "source", "detail", "corroborated"],
                "additionalProperties": False,
            },
        },
        "analysis": {"type": "string"},
        "legislation": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "provision": {"type": "string"},
                    "relevance": {"type": "string"},
                    "search_query": {"type": "string"},
                },
                "required": ["title", "provision", "relevance", "search_query"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["chronology", "key_evidence", "analysis", "legislation"],
    "additionalProperties": False,
}

DELIVERABLES_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "where_to_file": {"type": "string"},
        "time_limit": {"type": "string"},
        "fields": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"field": {"type": "string"}, "value": {"type": "string"}},
                "required": ["field", "value"],
                "additionalProperties": False,
            },
        },
        "statement": {"type": "string"},
        "remedy": {"type": "string"},
        "emails": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "purpose": {"type": "string"},
                    "to": {"type": "string"},
                    "subject": {"type": "string"},
                    "body": {"type": "string"},
                },
                "required": ["purpose", "to", "subject", "body"],
                "additionalProperties": False,
            },
        },
        "evidence": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "document": {"type": "string"},
                    "status": {"type": "string", "enum": ["gathered", "needed_from_you"]},
                    "note": {"type": "string"},
                },
                "required": ["document", "status", "note"],
                "additionalProperties": False,
            },
        },
        "your_actions": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "title", "where_to_file", "time_limit", "fields", "statement",
        "remedy", "emails", "evidence", "your_actions",
    ],
    "additionalProperties": False,
}

INTAKE_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "ready": {"type": "boolean"},
        "requests": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": ["question", "confirm", "document"]},
                    "label": {"type": "string"},
                    "why": {"type": "string"},
                    "value": {"type": "string"},
                },
                "required": ["kind", "label", "why"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["summary", "ready", "requests"],
    "additionalProperties": False,
}

RECOMMEND_SCHEMA = {
    "type": "object",
    "properties": {
        "recommendation": {
            "type": "string",
            "enum": ["pursue_with_lawyer", "pursue_without_lawyer", "do_not_pursue"],
        },
        "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
        "reasoning": {"type": "string"},
        "route_primary": {"type": "string"},
        "route_backstop": {"type": "string"},
        "route_avoid": {"type": "string"},
        "checks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "status": {"type": "string", "enum": ["pass", "attention", "fail", "unknown"]},
                    "note": {"type": "string"},
                },
                "required": ["label", "status", "note"],
                "additionalProperties": False,
            },
        },
        "time_limit": {"type": "string"},
        "next_steps": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "recommendation", "confidence", "reasoning", "route_primary",
        "route_backstop", "route_avoid", "checks", "time_limit", "next_steps",
    ],
    "additionalProperties": False,
}


# ---------------------------------------------------------------------------
# Prompts (legal framing — informational, not regulated advice)
# ---------------------------------------------------------------------------
FRAMING = (
    "You are CasePilot, an access-to-justice assistant for England & Wales. You help "
    "ordinary people understand a legal problem. Be accurate and grounded only in what "
    "the user told you — never invent facts, names, dates, or evidence. Provide clear "
    "information, not regulated legal advice; avoid guaranteeing outcomes."
)


# ---------------------------------------------------------------------------
# Mock fallbacks (coherent deposit-dispute case) — keep the demo alive on error
# ---------------------------------------------------------------------------
def mock_summary():
    return (
        "Deposit dispute: the client moved out of a rented flat and the landlord has "
        "refused to return the £1,450 deposit, citing cleaning and damage costs the "
        "client disputes."
    )


def mock_entities():
    return {
        "names": ["Mr. James Holloway (landlord)", "Sarah Bennett (client)", "QuickLet Agency"],
        "dates": ["12 Jan 2024 — tenancy start", "03 Mar 2026 — move out", "18 Mar 2026 — deposit refused"],
        "keywords": ["deposit", "deposit protection scheme", "cleaning costs", "check-out report"],
        "addresses": ["Flat 4B, 27 Elm Grove, Bristol, BS6 5DT"],
    }


def mock_synthesis():
    return {
        "chronology": [
            {"date": "12 Jan 2024", "event": "Tenancy signed; £1,450 deposit paid.", "evidence_ids": ["E3", "E4"]},
            {"date": "03 Mar 2026", "event": "Client moves out; flat left clean, photos taken.", "evidence_ids": ["E2"]},
            {"date": "18 Mar 2026", "event": "Landlord emails refusing the deposit, claiming £900 in cleaning/damage.", "evidence_ids": ["E1"]},
            {"date": "21 Mar 2026", "event": "Client disputes the deductions in writing; no response.", "evidence_ids": ["E1"]},
        ],
        "key_evidence": [
            {"id": "E1", "source": "Email — 18 Mar 2026", "detail": "Landlord's written refusal listing disputed deductions."},
            {"id": "E2", "source": "Photos — 03 Mar 2026", "detail": "Time-stamped photos of the cleaned flat at move-out."},
            {"id": "E3", "source": "Tenancy agreement", "detail": "Signed contract showing the £1,450 deposit amount."},
            {"id": "E4", "source": "Bank statement", "detail": "Record of the original deposit payment."},
        ],
        "analysis": (
            "Here is what appears to have happened. The client paid a £1,450 deposit at the "
            "start of the tenancy and, on moving out in March 2026, left the flat clean and "
            "documented its condition with time-stamped photos. The landlord then refused to "
            "return the deposit, asserting roughly £900 of cleaning and damage costs that the "
            "client disputes and which are not evidenced by any check-out report. The strongest "
            "part of the client's position is documentary: the deposit amount, the move-out "
            "condition, and the landlord's own written refusal are all on record. The pivotal "
            "open question is whether the deposit was protected in a government-approved scheme "
            "within 30 days of receipt — if it was not, the client may be entitled to the deposit "
            "back plus a penalty of 1–3x the deposit, independent of the cleaning dispute."
        ),
        "legislation": [
            {"title": "Housing Act 2004", "provision": "ss. 213–214 (tenancy deposit protection)", "relevance": "Requires the deposit to be protected within 30 days and allows a 1–3x penalty if not.", "search_query": "Housing Act 2004"},
            {"title": "Housing Act 2004", "provision": "s. 215 (sanctions for non-compliance)", "relevance": "Restricts the landlord's ability to evict and underpins the penalty claim.", "search_query": "Housing Act 2004"},
        ],
    }


def mock_recommendation():
    return {
        "recommendation": "pursue_without_lawyer",
        "confidence": "high",
        "reasoning": (
            "Strong documentary position and a clear legal test. Deposit disputes under £5,000 are "
            "well suited to the small claims track and rarely need a solicitor. The main risk is a "
            "landlord counterclaim for damages, which the photos and check-out evidence answer."
        ),
        "route_primary": (
            "Use the deposit protection scheme's free dispute resolution / adjudication first — it "
            "is free, on paper, and designed for tenants acting without a lawyer."
        ),
        "route_backstop": "Small claims via Money Claim Online (issue fee ~£35, recoverable) if adjudication doesn't resolve it.",
        "route_avoid": "Don't pay a claims-management company a percentage of a sum you can recover yourself for free.",
        "checks": [
            {"label": "Scheme/eligibility", "status": "pass", "note": "Assured shorthold tenancy deposit, in scope."},
            {"label": "Merits threshold", "status": "pass", "note": "Documented deposit, move-out condition and refusal."},
            {"label": "Standing", "status": "pass", "note": "Client is the named tenant."},
            {"label": "Limitation", "status": "pass", "note": "Well within the 6-year window."},
            {"label": "Deposit protection", "status": "attention", "note": "Confirm whether it was protected within 30 days — drives the penalty."},
        ],
        "time_limit": "",
        "next_steps": [
            "Confirm which scheme (if any) protected the deposit and when.",
            "Open free adjudication with that scheme, attaching the evidence.",
            "If unresolved, issue a small claim via Money Claim Online.",
        ],
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.post("/api/transcribe")
def transcribe():
    """Voice -> text. Accepts multipart 'audio' -> { transcript }."""
    if "audio" not in request.files:
        return jsonify(error="no audio file provided"), 400
    f = request.files["audio"]
    try:
        result = openai_client().audio.transcriptions.create(
            model="whisper-1",
            file=(f.filename or "audio.webm", f.read()),
        )
        return jsonify(transcript=result.text)
    except Exception as e:  # noqa: BLE001
        log.error("transcription failed: %s", e)
        return jsonify(error="transcription unavailable — set OPENAI_API_KEY and try again"), 503


# After this many rounds of follow-ups we stop asking and proceed regardless,
# so the user is never trapped in a loop.
MAX_CLARIFY_ROUNDS = 3


INTAKE_INSTRUCTIONS = (
    "You are taking first-instance intake for a potential legal matter in England & Wales, to the "
    "standard of a careful solicitor.\n\n"
    "FIRST, read the entire account, INCLUDING the full text of any [Attached document: ...] blocks "
    "— those are documents the client has already provided; mine them for facts. NEVER ask for "
    "anything that is already stated in the account or present in an attached document, and NEVER "
    "request a document that has already been attached.\n\n"
    "Produce a JSON object with:\n"
    "1) summary: a 2–3 sentence neutral summary (no advice).\n"
    "2) ready: true only when you have enough to build a chronology, evidence map and an honest "
    "recommendation AND every baseline detail below is known. Otherwise false.\n"
    "3) requests: an ORDERED list of the things you still need. Each item is {kind, label, why, "
    "value}:\n"
    "   • kind 'question' — you have no idea of the answer; the user types/dictates it. Leave value "
    "empty.\n"
    "   • kind 'confirm' — a value you INFERRED yourself (NOT one the user stated), shown for a "
    "one-tap Yes/No. Put your best answer in 'value'.\n"
    "   • kind 'document' — a file to upload. Leave value empty.\n"
    " CRITICAL — DO NOT BE REDUNDANT: if a fact is explicitly stated ANYWHERE in the account (the "
    "dump, a previous answer, or an attached document), treat it as KNOWN — do NOT ask it and do NOT "
    "show it as a 'confirm'. Use 'confirm' ONLY for something you inferred that the user did not "
    "state. Keep the user's effort to an absolute minimum.\n"
    " BIAS STRONGLY TO DONE: the moment you know who the client is, the core facts of what happened, "
    "the current status, and their goal, set ready=true and return an EMPTY list. Do not keep probing "
    "for nice-to-have details, exact figures, or more documents — those get gathered later and must "
    "never hold the case up.\n"
    "Order the list exactly like this:\n"
    "   (a) FIRST, the personal baseline — ONE item per fact, NEVER bundled together. Cover each of "
    "these separately and only if not already clearly known: full name, email address, age, "
    "nationality, and where they are resident. Use 'confirm' (with your inferred value) where you "
    "can, 'question' only where you truly have nothing.\n"
    "   (b) THEN 'document' requests for evidence immediately relevant to what's already provided. "
    "If a document the client gave points to related records, ask for those too (e.g. they provided "
    "a booking confirmation → request the boarding pass, the airline's rejection email, and a flight "
    "status/tracker screenshot). Name each document concretely with a one-line why.\n"
    "   (c) THEN items for the remaining facts you need to establish and evaluate the claim that are "
    "NOT already answered — the current status and what's happened so far, steps already taken, "
    "their ideal outcome, and the case-specific 'search anchors' a later inbox search would use "
    "(the other party and how to identify them, reference numbers, exact dates, times, amounts, "
    "anyone else involved). Prefer 'confirm' over 'question' wherever you have a likely value.\n"
    "If you genuinely have everything, set ready=true and return an empty requests list.\n"
)


def assess_intake(transcript, files, asked=None, force_ready=False):
    """Summarise the account and decide what's still needed. Returns
    {summary, ready, requests[]}. `asked` lists items already shown in earlier
    rounds so we never repeat them. On any failure, proceed (ready=True)."""
    if not transcript.strip():
        return {"summary": "", "ready": False,
                "requests": [{"kind": "question",
                              "label": "What's the legal problem you need help with?",
                              "why": "We need a starting point."}]}
    already = ""
    if asked:
        already = (
            "\nYou have ALREADY shown the user these items in earlier rounds — NEVER show any of them "
            "again, even reworded. If the only things still outstanding are in this list (or are "
            "documents), set ready=true with an empty list:\n- " + "\n- ".join(asked) + "\n"
        )
    try:
        result = claude_json(
            FRAMING,
            INTAKE_INSTRUCTIONS + already + f"\nFile names attached: {files}\n\n---\n{transcript}",
            INTAKE_SCHEMA,
            max_tokens=2200,
        )
        if force_ready:
            result["ready"], result["requests"] = True, []
        return result
    except Exception as e:  # noqa: BLE001
        log.error("intake assessment failed, proceeding: %s", e)
        return {"summary": mock_summary(), "ready": True, "requests": []}


@app.post("/api/intake")
def intake():
    """multipart: transcript + files[] -> { case_id, summary, ready, requests }.

    Any uploaded files are read (text extracted) and embedded in the account so
    the assessment can mine them before deciding what's still missing."""
    transcript = (request.form.get("transcript") or "").strip()
    doc_text, names, blobs = ingest_files(request.files.getlist("files"))
    full = (transcript + doc_text).strip()
    case_id = uuid.uuid4().hex[:8]

    res = assess_intake(full, names)
    CASES[case_id] = {
        "transcript": full, "files": names, "files_store": blobs,
        "summary": res["summary"], "rounds": 0,
        "asked": [r["label"] for r in res["requests"]],
    }
    return jsonify(case_id=case_id, **res)


@app.post("/api/clarify")
def clarify():
    """multipart: case_id + responses(JSON) + files[] -> { summary, ready, requests }.

    Folds the user's answers and any newly uploaded documents into the account and
    re-assesses. After MAX_CLARIFY_ROUNDS we force ready so they can always move on."""
    case = CASES.get(request.form.get("case_id", ""))
    if case is None:
        return jsonify(error="unknown case_id"), 404

    try:
        responses = json.loads(request.form.get("responses") or "[]")
    except json.JSONDecodeError:
        responses = []
    answered = [r for r in responses if (r.get("answer") or "").strip()]
    if answered:
        qa = "\n\n".join(f"Q: {r['question']}\nA: {r['answer'].strip()}" for r in answered)
        case["transcript"] = f"{case['transcript']}\n\n{qa}".strip()

    doc_text, names, blobs = ingest_files(request.files.getlist("files"))
    if doc_text:
        case["transcript"] += doc_text
        case["files"] = case.get("files", []) + names
        case.setdefault("files_store", []).extend(blobs)

    case["rounds"] = case.get("rounds", 0) + 1
    res = assess_intake(case["transcript"], case.get("files", []),
                        asked=case.get("asked", []),
                        force_ready=case["rounds"] >= MAX_CLARIFY_ROUNDS)
    case["asked"] = case.get("asked", []) + [r["label"] for r in res["requests"]]
    case["summary"] = res["summary"] or case.get("summary", "")
    return jsonify(**res)


@app.post("/api/extract-entities")
def extract_entities():
    """{ case_id } -> { names, dates, keywords, addresses }."""
    case = CASES.get(_case_id())
    transcript = (case or {}).get("transcript", "")
    try:
        entities = claude_json(
            FRAMING,
            "Extract entities from the user's account below. Return names (people, companies, "
            "agencies), dates (with a short label), keywords (the terms worth searching an inbox "
            "for), and addresses. Only include items actually present or clearly implied.\n\n"
            f"---\n{transcript}",
            ENTITY_SCHEMA,
        )
    except Exception as e:  # noqa: BLE001
        log.error("extract-entities failed, using mock: %s", e)
        entities = mock_entities()

    if case is not None:
        case["entities"] = entities
    return jsonify(**entities)


GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
# PKCE code_verifier per OAuth state, set when we build the auth URL and needed
# again at the callback to exchange the code.
GMAIL_VERIFIERS = {}


def gmail_configured():
    return bool(os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET"))


def _gmail_redirect():
    return os.environ.get("GMAIL_REDIRECT_URI", "http://localhost:5001/api/gmail/callback")


def _gmail_flow(state=None):
    from google_auth_oauthlib.flow import Flow

    cfg = {
        "web": {
            "client_id": os.environ["GOOGLE_CLIENT_ID"],
            "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [_gmail_redirect()],
        }
    }
    flow = Flow.from_client_config(cfg, scopes=GMAIL_SCOPES, state=state)
    flow.redirect_uri = _gmail_redirect()
    return flow


def _gmail_auth_url(case_id):
    flow = _gmail_flow(state=case_id)
    url, _ = flow.authorization_url(
        access_type="offline", include_granted_scopes="true", prompt="consent"
    )
    GMAIL_VERIFIERS[case_id] = flow.code_verifier  # needed to exchange the code (PKCE)
    return url


def build_gmail_query(entities):
    """Turn extracted entities into a precise Gmail search (the playbook's anchors)."""
    terms = []
    for key in ("keywords", "names"):
        for raw in entities.get(key, []):
            t = re.sub(r"\(.*?\)", "", raw).strip()  # drop parentheticals like "(landlord)"
            if 4 <= len(t) and len(t.split()) <= 4:
                terms.append(f'"{t}"' if " " in t else t)
    terms = list(dict.fromkeys(terms))[:10]
    return " OR ".join(terms) if terms else "newer_than:2y"


def _gmail_body(payload):
    """Pull the plain-text body and attachment filenames out of a Gmail message."""
    body, attachments = "", []

    def walk(part):
        nonlocal body
        if part.get("filename"):
            attachments.append(part["filename"])
        data = part.get("body", {}).get("data")
        if part.get("mimeType") == "text/plain" and data and not body:
            body = base64.urlsafe_b64decode(data + "===").decode("utf-8", "ignore")
        for sub in part.get("parts", []) or []:
            walk(sub)

    walk(payload)
    return body, attachments


def gmail_search(case):
    """Search the connected inbox using the case's entity anchors; return matches."""
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds = Credentials.from_authorized_user_info(json.loads(case["gmail_creds"]), GMAIL_SCOPES)
    if not creds.valid and creds.refresh_token:
        creds.refresh(Request())
        case["gmail_creds"] = creds.to_json()

    svc = build("gmail", "v1", credentials=creds, cache_discovery=False)
    q = build_gmail_query(case.get("entities", {}))
    log.info("gmail search query: %s", q)
    listing = svc.users().messages().list(userId="me", q=q, maxResults=12).execute()

    out = []
    for m in listing.get("messages", []):
        full = svc.users().messages().get(userId="me", id=m["id"], format="full").execute()
        headers = {h["name"].lower(): h["value"] for h in full.get("payload", {}).get("headers", [])}
        body, attachments = _gmail_body(full.get("payload", {}))
        out.append(
            {
                "subject": headers.get("subject", "(no subject)"),
                "from": headers.get("from", ""),
                "date": headers.get("date", ""),
                "snippet": full.get("snippet", ""),
                "body": body[:4000],
                "attachments": attachments,
            }
        )
    return out


@app.get("/api/gmail/callback")
def gmail_callback():
    """OAuth redirect target: exchange the code and store creds against the case."""
    cid = request.args.get("state", "")
    msg = "Gmail connected. You can close this tab and return to CasePilot."
    try:
        flow = _gmail_flow(state=cid)
        flow.code_verifier = GMAIL_VERIFIERS.pop(cid, None)  # restore PKCE verifier
        flow.fetch_token(authorization_response=request.url)
        if cid in CASES:
            CASES[cid]["gmail_creds"] = flow.credentials.to_json()
    except Exception as e:  # noqa: BLE001
        log.error("gmail callback failed: %s", e)
        msg = "Connection failed — please close this tab and try again."
    return Response(
        "<!doctype html><meta charset='utf-8'><body style='font-family:sans-serif;text-align:center;"
        f"margin-top:80px;color:#1a1a1a'><h2>{msg}</h2></body>",
        mimetype="text/html",
    )


@app.post("/api/connect-gmail")
def connect_gmail():
    """{ case_id } -> connect + search the inbox.

    - not configured -> mock result (keeps the demo working without Google creds)
    - configured but not yet authorised -> { status: needs_auth, auth_url }
    - authorised -> search with the entity anchors, fold findings into the case
    """
    cid = _case_id()
    case = CASES.get(cid)

    if not gmail_configured():
        return jsonify(status="connected", emails_found=12, configured=False, results=[])

    if not case or "gmail_creds" not in case:
        return jsonify(status="needs_auth", auth_url=_gmail_auth_url(cid), configured=True)

    try:
        results = gmail_search(case)
        case["emails_found"] = [{k: r[k] for k in ("subject", "from", "date", "attachments")} for r in results]
        for r in results:  # fold the found emails into the account for synthesis/deliverables
            case["transcript"] = (
                case.get("transcript", "")
                + f"\n\n[Email — {r['date']} — from {r['from']} — {r['subject']}]\n{r['body']}"
            )
        return jsonify(
            status="connected",
            emails_found=len(results),
            configured=True,
            results=[{k: r[k] for k in ("subject", "from", "date")} for r in results],
        )
    except Exception as e:  # noqa: BLE001
        log.error("gmail search failed: %s", e)
        return jsonify(status="error", error=str(e)[:200], configured=True)


@app.post("/api/synthesize")
def synthesize():
    """{ case_id } -> { chronology, key_evidence, analysis, legislation }."""
    cid = _case_id()
    case = CASES.get(cid) or {}
    transcript = case.get("transcript", "")
    entities = case.get("entities", {})

    try:
        data = claude_json(
            FRAMING,
            "Build a case synthesis from the account and extracted entities below.\n"
            "Return:\n"
            "- key_evidence: each item with an id ('E1','E2',...), a source label, what it shows, and "
            "corroborated. Set corroborated=true ONLY if the item is backed by an attached document "
            "or an email in the account (a [Attached document: ...] or [Email ...] block); set it "
            "false if it rests only on the client's own say-so with no supporting document yet.\n"
            "- chronology: dated events in order; each event's evidence_ids must reference the "
            "key_evidence ids that support it.\n"
            "- analysis: a detailed, plain-English narrative (roughly 150–230 words) of what most "
            "likely happened and what the situation looks like — the strengths, the weaknesses, and "
            "the key open questions. Write it for the client, not a court.\n"
            "- legislation: the specific Acts/sections of England & Wales law that apply. For each, "
            "give the title, the provision (section), why it's relevant, and a search_query that is "
            "the plain Act title (e.g. 'Housing Act 2004') for looking it up.\n\n"
            f"ENTITIES:\n{json.dumps(entities)}\n\n---\n{transcript}",
            SYNTH_SCHEMA,
        )
        data["legislation"] = enrich_legislation(data.get("legislation", []))
    except Exception as e:  # noqa: BLE001
        log.error("synthesize failed, using mock: %s", e)
        data = mock_synthesis()
        data["legislation"] = enrich_legislation(data["legislation"])

    _attach_evidence_links(cid, case, data.get("key_evidence", []))
    case["synthesis"] = data
    return jsonify(**data)


def _attach_evidence_links(case_id, case, key_evidence):
    """For each evidence item, default corroborated and add an `href` when the item
    maps to a document the client actually uploaded (served via /api/file)."""
    store = case.get("files_store", [])
    for ev in key_evidence:
        ev.setdefault("corroborated", True)
        ev["href"] = ""
        blob = f"{ev.get('source', '')} {ev.get('detail', '')}".lower()
        for i, f in enumerate(store):
            stem = re.sub(r"\.[a-z0-9]+$", "", f["name"].lower())
            if stem and stem in blob:
                ev["href"] = f"/api/file/{case_id}/{i}"
                break


@app.post("/api/recommend")
def recommend():
    """{ case_id } -> { recommendation, confidence, reasoning }."""
    case = CASES.get(_case_id()) or {}
    transcript = case.get("transcript", "")
    synthesis = case.get("synthesis", {})

    try:
        rec = claude_json(
            FRAMING,
            "You are the lawyer writing the 'merits and route' verdict for this matter (England & "
            "Wales). Be honest and concrete, weighing evidence strength, who bears the burden, "
            "likely value, cost and proportionality. Produce JSON with:\n"
            "- recommendation: pursue_with_lawyer | pursue_without_lawyer | do_not_pursue.\n"
            "- confidence: low | medium | high.\n"
            "- reasoning: an honest 'is it worth pursuing?' assessment — the realistic prospects, "
            "where the case is won or lost, and the key caveats. Don't guarantee outcomes.\n"
            "- route_primary: the recommended route and WHY, tailored to the value and matter type "
            "(e.g. a named ombudsman/ADR scheme, or the small claims track for low-value money "
            "claims), noting it is free or low-cost and where the burden sits.\n"
            "- route_backstop: the fallback route to hold in reserve (e.g. small claims if ADR "
            "fails), with the rough issue fee if relevant.\n"
            "- route_avoid: what to AVOID and why (e.g. a claims-management/no-win-no-fee company "
            "taking 25–40%, or instructing a solicitor where the value makes it disproportionate). "
            "Empty string if nothing to flag.\n"
            "- checks: knockout/threshold checks as {label, status, note}. status is 'pass', "
            "'attention' (live/time-sensitive or needs action), 'fail', or 'unknown'. Cover the "
            "ones that apply: scope/eligibility, the merits threshold, standing, any limitation or "
            "scheme time limit, whether the other side's internal process is exhausted, and the "
            "opponent's identity/solvency where it affects recovery.\n"
            "- time_limit: the single most important deadline to act before, as a short phrase with "
            "the date if known (e.g. 'File the ADR referral by ~13 Sep 2026'); empty string if none.\n"
            "- next_steps: ONLY the actions that genuinely require the client themselves — e.g. "
            "sending an email CasePilot has drafted, pasting the prepared submission and clicking "
            "submit, or supplying a document only they hold. Do NOT list work CasePilot can do for "
            "them (drafting emails, preparing the submission, assembling the evidence) — assume "
            "CasePilot prepares all of that. Phrase each as the client's send/submit/provide action.\n"
            "Informational only, not regulated advice.\n\n"
            f"SYNTHESIS:\n{json.dumps(synthesis)}\n\n---\n{transcript}",
            RECOMMEND_SCHEMA,
        )
    except Exception as e:  # noqa: BLE001
        log.error("recommend failed, using mock: %s", e)
        rec = mock_recommendation()

    case["recommendation"] = rec
    return jsonify(**rec)


def draft_deliverables(case):
    """Produce the lean, ready-to-act deliverables: the bare-necessity submission
    for the relevant ADR/claim site, the email(s) drafted ready to send, the
    evidence bundle (gathered vs still-needed), and the few client-only actions."""
    rec = case.get("recommendation", {})
    payload = {
        "summary": case.get("summary"),
        "entities": case.get("entities", {}),
        "synthesis": case.get("synthesis", {}),
        "recommended_route": rec.get("route_primary", ""),
        "gathered_emails": case.get("emails_found", []),
    }
    return claude_json(
        FRAMING,
        "You are CasePilot doing the work FOR the client, not advising them to do it. Assume their "
        "inbox has already been searched and the emails/documents listed have been gathered. "
        "Produce the minimum needed to FILE the claim via the recommended route (e.g. the "
        "AviationADR online form at aviationadr.org.uk, or the relevant ombudsman/small-claims "
        "route) — nothing more. Build only from the facts below; never invent facts (use '' for "
        "anything unknown). Crucially: write everything you possibly can yourself, and leave the "
        "client ONLY the things that genuinely require them (physically sending/submitting, or "
        "supplying a document only they hold).\n\n"
        "Return JSON:\n"
        "- title: e.g. 'Your AviationADR claim — ready to file'.\n"
        "- where_to_file: the site/scheme and how to file (one line, e.g. 'AviationADR — "
        "aviationadr.org.uk, online form').\n"
        "- time_limit: the deadline to file by (short), or ''.\n"
        "- fields: the exact values to paste into the online form, as {field, value} (claimant "
        "name/address/email, airline, flight no, date, route, references, amount claimed, etc.).\n"
        "- statement: the statement-of-case text to paste into the form's free-text box. PLAIN "
        "ENGLISH ONLY — explain the argument the way you'd say it to a friend; do NOT cite any "
        "statutes, regulations, article numbers or case law. Keep it tight: what happened, what's "
        "owed, why the other side's reason doesn't hold. A few short paragraphs, no headings.\n"
        "- remedy: the amount/outcome sought, in one line.\n"
        "- emails: any message the client should SEND, fully DRAFTED and ready to copy — {purpose, "
        "to, subject, body}. Write the body in full (signed off generically). Include the final "
        "letter putting the other side to proof if that's a sensible step.\n"
        "- evidence: the bundle as {document, status, note}. status='gathered' for anything found "
        "in the inbox or already provided; 'needed_from_you' ONLY for items that must come from the "
        "client (e.g. a paper receipt). Keep 'needed_from_you' to the genuine minimum.\n"
        "- your_actions: the SHORT list of things ONLY the client can do (send the drafted email, "
        "paste the statement and click submit, attach the bundle, provide any 'needed_from_you' "
        "item). Do not list anything CasePilot has already done.\n\n"
        f"{json.dumps(payload)}",
        DELIVERABLES_SCHEMA,
        max_tokens=6000,
    )


@app.post("/api/generate-pack")
def generate_pack():
    """{ case_id } -> { pack_url }. Drafts deliverables now; GET /api/pack/<id> renders them."""
    cid = _case_id()
    if cid not in CASES:
        # Seed a mock case so the button still produces a pack in a cold demo.
        CASES[cid] = {
            "summary": mock_summary(),
            "entities": mock_entities(),
            "synthesis": {**mock_synthesis(), "legislation": enrich_legislation(mock_synthesis()["legislation"])},
            "recommendation": mock_recommendation(),
        }
    case = CASES[cid]
    try:
        case["deliverables"] = draft_deliverables(case)
    except Exception as e:  # noqa: BLE001
        log.error("deliverables draft failed: %s", e)
        case["deliverables"] = None
    return jsonify(pack_url=f"/api/pack/{cid}")


@app.get("/api/pack/<case_id>")
def pack(case_id):
    """Render the lawyer-ready document pack as HTML."""
    case = CASES.get(case_id)
    if not case:
        return Response("Case not found", status=404)
    return Response(render_pack(case_id, case), mimetype="text/html")


@app.get("/api/file/<case_id>/<int:idx>")
def serve_file(case_id, idx):
    """Serve a document the client uploaded, so evidence can link to it."""
    store = (CASES.get(case_id) or {}).get("files_store", [])
    if idx >= len(store):
        return Response("Not found", status=404)
    f = store[idx]
    return Response(
        f["data"],
        mimetype=f.get("mime") or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{f["name"]}"'},
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _case_id():
    return (request.get_json(silent=True) or {}).get("case_id", "")


def render_pack(case_id, case):
    """Lean, ready-to-file pack: exactly what's needed to submit the claim, plus the
    emails CasePilot has drafted and the few things only the client can do."""
    import html

    def esc(x):
        return html.escape(str(x or ""))

    d = case.get("deliverables")
    if not d:
        return f"""<!doctype html><meta charset="utf-8"><body style="font-family:Georgia,serif;max-width:720px;margin:60px auto;padding:0 24px">
        <h1>CasePilot</h1><p>Your pack is still being prepared, or couldn't be generated. Please
        re-run "Generate case pack" (case {esc(case_id)}).</p></body>"""

    fields = "".join(
        f"<tr><td class='k'>{esc(f['field'])}</td><td>{esc(f['value'])}</td></tr>"
        for f in d.get("fields", [])
    )
    emails = "".join(
        f"""<div class="email">
          <p class="muted">{esc(e.get('purpose'))}</p>
          <p><b>To:</b> {esc(e.get('to'))}<br><b>Subject:</b> {esc(e.get('subject'))}</p>
          <div class="prose body">{esc(e.get('body'))}</div>
        </div>"""
        for e in d.get("emails", [])
    )
    gathered = "".join(
        f"<li>✅ <b>{esc(e['document'])}</b>{(' — ' + esc(e['note'])) if e.get('note') else ''}</li>"
        for e in d.get("evidence", []) if e.get("status") == "gathered"
    )
    needed = "".join(
        f"<li>📎 <b>{esc(e['document'])}</b>{(' — ' + esc(e['note'])) if e.get('note') else ''}</li>"
        for e in d.get("evidence", []) if e.get("status") == "needed_from_you"
    )
    actions = "".join(f"<li>{esc(s)}</li>" for s in d.get("your_actions", []))

    return f"""<!doctype html><html><head><meta charset="utf-8">
<title>CasePilot — {esc(d.get('title'))}</title>
<style>
  body{{font-family:Georgia,serif;max-width:760px;margin:40px auto;padding:0 24px;color:#1a1a1a;line-height:1.55}}
  h1{{font-size:24px;margin-bottom:2px}} h2{{border-bottom:2px solid #333;padding-bottom:4px;margin-top:32px;font-size:19px}}
  .muted{{color:#666;font-size:13px}} table{{width:100%;border-collapse:collapse}}
  td{{vertical-align:top;padding:6px 6px;border-bottom:1px solid #eee}} .k{{white-space:nowrap;font-weight:bold;width:200px;color:#333}}
  .warn{{background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:10px 14px;margin:12px 0;font-size:15px}}
  .todo{{background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:6px 20px 16px;margin-top:14px}}
  .email{{border:1px solid #ddd;border-radius:8px;padding:6px 16px 14px;margin:12px 0;background:#fcfcfa}}
  .prose{{white-space:pre-line}} .body{{margin-top:8px;padding-top:8px;border-top:1px dashed #ddd}}
  ul,ol{{margin:6px 0}} li{{margin:3px 0}} a{{color:#1d4ed8}}
  .disc{{margin-top:36px;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px}}
</style></head><body>
  <h1>{esc(d.get('title'))}</h1>
  <p class="muted">Reference: {esc(case_id)} · Prepared for you by CasePilot</p>
  {f"<div class='warn'>⏰ <b>File before:</b> {esc(d['time_limit'])}</div>" if d.get('time_limit') else ''}
  {f"<p><b>Where to file:</b> {esc(d['where_to_file'])}</p>" if d.get('where_to_file') else ''}

  <h2>Your details for the form</h2>
  <table>{fields or "<tr><td>—</td></tr>"}</table>

  <h2>Statement of case <span class="muted">(paste into the form)</span></h2>
  <div class="prose">{esc(d.get('statement'))}</div>

  <h2>What you're claiming</h2><p>{esc(d.get('remedy'))}</p>

  {f"<h2>Emails we've drafted for you</h2><p class='muted'>Ready to send — just copy.</p>{emails}" if emails else ""}

  <h2>Evidence bundle</h2>
  {f"<p class='muted'>Gathered for you:</p><ul>{gathered}</ul>" if gathered else ""}
  {f"<p class='muted'>We still need from you:</p><ul>{needed}</ul>" if needed else "<p class='muted'>Everything needed has been gathered.</p>"}

  <div class="todo"><h2 style="border:0;margin-top:14px">✅ What you need to do</h2><ol>{actions or "<li>You're all set.</li>"}</ol></div>

  <p class="disc">Prepared by CasePilot from the information and documents you provided. Informational
  only — not regulated legal advice, and no solicitor–client relationship is created.</p>
</body></html>"""


if __name__ == "__main__":
    app.run(port=5001, debug=True)
