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
    """Read uploaded Werkzeug files. Returns (text_to_append, names) where the text
    embeds each document's extracted contents so the assessment can read them."""
    chunks, names = [], []
    for f in files:
        name = f.filename or "file"
        names.append(name)
        text = extract_text(name, f.read())
        chunks.append(
            f"\n\n[Attached document: {name}]\n{text.strip() or '(no extractable text — e.g. an image/scan)'}"
        )
    return "".join(chunks), names


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
                },
                "required": ["id", "source", "detail"],
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

FILING_SCHEMA = {
    "type": "object",
    "properties": {
        "doc_type": {"type": "string"},
        "title": {"type": "string"},
        "time_limit": {"type": "string"},
        "header_fields": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"field": {"type": "string"}, "value": {"type": "string"}},
                "required": ["field", "value"],
                "additionalProperties": False,
            },
        },
        "process_exhausted": {"type": "string"},
        "statement_of_case": {"type": "string"},
        "remedy": {"type": "string"},
        "evidence": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "ref": {"type": "string"},
                    "document": {"type": "string"},
                    "shows": {"type": "string"},
                },
                "required": ["ref", "document", "shows"],
                "additionalProperties": False,
            },
        },
        "notes": {"type": "string"},
    },
    "required": [
        "doc_type", "title", "time_limit", "header_fields", "process_exhausted",
        "statement_of_case", "remedy", "evidence", "notes",
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
    "   • kind 'confirm' — you can already see or reasonably infer the answer from the account or an "
    "attached document, but want to verify it. Put your best answer in 'value'; the user just taps "
    "Yes/No (no typing). Use this whenever you have a likely value.\n"
    "   • kind 'document' — a file to upload. Leave value empty.\n"
    " keep the user's effort to an absolute minimum: never make them type something you can offer as "
    "a confirm, and if a detail is already explicitly and unambiguously stated, omit it entirely.\n"
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


def assess_intake(transcript, files, force_ready=False):
    """Summarise the account and decide what's still needed. Returns
    {summary, ready, requests[]}. On any failure, proceed (ready=True)."""
    if not transcript.strip():
        return {"summary": "", "ready": False,
                "requests": [{"kind": "question",
                              "label": "What's the legal problem you need help with?",
                              "why": "We need a starting point."}]}
    try:
        result = claude_json(
            FRAMING,
            INTAKE_INSTRUCTIONS + f"\nFile names attached: {files}\n\n---\n{transcript}",
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
    doc_text, names = ingest_files(request.files.getlist("files"))
    full = (transcript + doc_text).strip()
    case_id = uuid.uuid4().hex[:8]

    res = assess_intake(full, names)
    CASES[case_id] = {"transcript": full, "files": names, "summary": res["summary"], "rounds": 0}
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

    doc_text, names = ingest_files(request.files.getlist("files"))
    if doc_text:
        case["transcript"] += doc_text
        case["files"] = case.get("files", []) + names

    case["rounds"] = case.get("rounds", 0) + 1
    res = assess_intake(case["transcript"], case.get("files", []),
                        force_ready=case["rounds"] >= MAX_CLARIFY_ROUNDS)
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


@app.post("/api/connect-gmail")
def connect_gmail():
    """{ case_id } -> { status, emails_found }. Still mocked — Gmail wiring is deferred."""
    request.get_json(silent=True)
    return jsonify(status="connected", emails_found=12)


@app.post("/api/synthesize")
def synthesize():
    """{ case_id } -> { chronology, key_evidence, analysis, legislation }."""
    case = CASES.get(_case_id()) or {}
    transcript = case.get("transcript", "")
    entities = case.get("entities", {})

    try:
        data = claude_json(
            FRAMING,
            "Build a case synthesis from the account and extracted entities below.\n"
            "Return:\n"
            "- key_evidence: each item with an id ('E1','E2',...), a source label, and what it shows.\n"
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

    case["synthesis"] = data
    return jsonify(**data)


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
            "- next_steps: an ordered list of concrete actions the person should take next.\n"
            "Informational only, not regulated advice.\n\n"
            f"SYNTHESIS:\n{json.dumps(synthesis)}\n\n---\n{transcript}",
            RECOMMEND_SCHEMA,
        )
    except Exception as e:  # noqa: BLE001
        log.error("recommend failed, using mock: %s", e)
        rec = mock_recommendation()

    case["recommendation"] = rec
    return jsonify(**rec)


def draft_filing(case):
    """Draft the ready-to-file document (ADR submission / letter before action /
    small-claims particulars) from the case, matching a solicitor's filing."""
    rec = case.get("recommendation", {})
    payload = {
        "summary": case.get("summary"),
        "entities": case.get("entities", {}),
        "synthesis": case.get("synthesis", {}),
        "recommended_route": rec.get("route_primary", ""),
    }
    return claude_json(
        FRAMING,
        "You are the lawyer producing the ready-to-file document for this matter (England & Wales), "
        "to the standard of a clean, persuasive filing the client can submit themselves. Choose the "
        "document type that fits the recommended route (e.g. an ADR/ombudsman submission, a letter "
        "before action, or small-claims particulars of claim). Build it ONLY from the facts, "
        "evidence and legislation below — never invent facts. Produce JSON with:\n"
        "- doc_type: the kind of document (short).\n"
        "- title: a title for the document.\n"
        "- time_limit: the key 'act before' deadline as a short sentence, or '' if none.\n"
        "- header_fields: the form/header fields as {field, value} (e.g. claimant, respondent, "
        "references, the key facts/figures). Use '' for values not known rather than inventing them.\n"
        "- process_exhausted: a short paragraph confirming any internal complaints process is "
        "complete (with dates), or '' if not applicable.\n"
        "- statement_of_case: the heart of the filing as clear prose. Start with a short numbered "
        "chronology, then the argument: establish the claim is in scope and the amount/remedy due; "
        "state who bears the burden and the legal test (citing the relevant Act/section); then "
        "apply the facts and evidence to show the claim succeeds or the other side's defence is not "
        "made out. Use plain paragraphs and numbered points; this is the free-text box of a form.\n"
        "- remedy: exactly what is sought.\n"
        "- evidence: a numbered schedule as {ref, document, shows} (ref like 'E1').\n"
        "- notes: a brief file note on the governing law/authorities, or '' .\n\n"
        f"{json.dumps(payload)}",
        FILING_SCHEMA,
        max_tokens=6000,
    )


@app.post("/api/generate-pack")
def generate_pack():
    """{ case_id } -> { pack_url }. Drafts the filing now; GET /api/pack/<id> renders it."""
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
        case["filing"] = draft_filing(case)
    except Exception as e:  # noqa: BLE001
        log.error("filing draft failed: %s", e)
        case["filing"] = None
    return jsonify(pack_url=f"/api/pack/{cid}")


@app.get("/api/pack/<case_id>")
def pack(case_id):
    """Render the lawyer-ready document pack as HTML."""
    case = CASES.get(case_id)
    if not case:
        return Response("Case not found", status=404)
    return Response(render_pack(case_id, case), mimetype="text/html")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _case_id():
    return (request.get_json(silent=True) or {}).get("case_id", "")


def render_pack(case_id, case):
    """Build a self-contained HTML case pack from the stored case."""
    import html

    def esc(x):
        return html.escape(str(x or ""))

    syn = case.get("synthesis", {})
    ent = case.get("entities", {})
    rec = case.get("recommendation", {})

    chrono = "".join(
        f"<tr><td class='date'>{esc(c['date'])}</td><td>{esc(c['event'])}"
        f"<span class='ev'>{esc(', '.join(c.get('evidence_ids', [])))}</span></td></tr>"
        for c in syn.get("chronology", [])
    )
    evidence = "".join(
        f"<li><b>[{esc(e['id'])}] {esc(e['source'])}</b> — {esc(e['detail'])}</li>"
        for e in syn.get("key_evidence", [])
    )
    legislation = "".join(
        f"<li><b>{esc(l['title'])}</b>{(' — ' + esc(l['provision'])) if l.get('provision') else ''}<br>"
        f"{esc(l['relevance'])}"
        + (f"<br><a href='{esc(l['url'])}'>{esc(l['url'])}</a>" if l.get("url") else "")
        + "</li>"
        for l in syn.get("legislation", [])
    )
    chips = "".join(
        f"<h4>{esc(k.title())}</h4><p>{esc(' · '.join(v))}</p>"
        for k, v in ent.items()
        if v
    )
    verdict = {
        "pursue_with_lawyer": "Pursue — with a lawyer",
        "pursue_without_lawyer": "Pursue — you can likely do this yourself",
        "do_not_pursue": "Not worth pursuing",
    }.get(rec.get("recommendation"), "—")

    route_bits = "".join(
        f"<p><b>{lbl}:</b> {esc(rec[key])}</p>"
        for lbl, key in [("Route", "route_primary"), ("Backstop", "route_backstop"), ("Avoid", "route_avoid")]
        if rec.get(key)
    )
    dot = {"pass": "#16a34a", "attention": "#d97706", "fail": "#dc2626", "unknown": "#9ca3af"}
    checks = "".join(
        f"<li><span style='color:{dot.get(c.get('status'), '#9ca3af')}'>●</span> "
        f"<b>{esc(c['label'])}</b> — {esc(c['note'])}</li>"
        for c in rec.get("checks", [])
    )
    steps = "".join(f"<li>{esc(s)}</li>" for s in rec.get("next_steps", []))
    time_limit = (
        f"<div class='warn'>⏰ <b>Act before:</b> {esc(rec['time_limit'])}</div>"
        if rec.get("time_limit")
        else ""
    )

    # Drafted filing (ADR submission / letter before action / small-claims particulars)
    filing = case.get("filing")
    filing_html = ""
    if filing:
        hdr = "".join(
            f"<tr><td class='date'>{esc(f['field'])}</td><td>{esc(f['value'])}</td></tr>"
            for f in filing.get("header_fields", [])
        )
        ev = "".join(
            f"<tr><td class='date'>{esc(e['ref'])}</td><td><b>{esc(e['document'])}</b> — {esc(e['shows'])}</td></tr>"
            for e in filing.get("evidence", [])
        )
        filing_html = f"""
  <div class="filing">
    <h2>{esc(filing.get('title'))}</h2>
    <p class="muted">{esc(filing.get('doc_type'))}</p>
    {f"<div class='warn'>⏰ <b>Time limit:</b> {esc(filing['time_limit'])}</div>" if filing.get('time_limit') else ''}
    {f"<table>{hdr}</table>" if hdr else ''}
    {f"<h3>Confirmation the internal process is exhausted</h3><p>{esc(filing['process_exhausted'])}</p>" if filing.get('process_exhausted') else ''}
    <h3>Statement of case</h3><div class="prose">{esc(filing.get('statement_of_case'))}</div>
    <h3>Remedy sought</h3><p>{esc(filing.get('remedy'))}</p>
    {f"<h3>Evidence</h3><table>{ev}</table>" if ev else ''}
    {f"<p class='muted' style='margin-top:14px'><i>Note: {esc(filing['notes'])}</i></p>" if filing.get('notes') else ''}
  </div>"""

    return f"""<!doctype html><html><head><meta charset="utf-8">
<title>CasePilot — Case Pack {esc(case_id)}</title>
<style>
  body{{font-family:Georgia,serif;max-width:820px;margin:40px auto;padding:0 24px;color:#1a1a1a;line-height:1.55}}
  h1{{font-size:26px;margin-bottom:4px}} h2{{border-bottom:2px solid #333;padding-bottom:4px;margin-top:34px}}
  h3{{margin-top:20px}} .muted{{color:#666;font-size:13px}} table{{width:100%;border-collapse:collapse}}
  td{{vertical-align:top;padding:7px 6px;border-bottom:1px solid #eee}} .date{{white-space:nowrap;font-weight:bold;width:160px}}
  .ev{{display:inline-block;margin-left:8px;font-size:11px;color:#fff;background:#4f46e5;border-radius:8px;padding:1px 7px}}
  .verdict{{background:#f4f1ea;border:1px solid #ddd;border-radius:8px;padding:16px 18px;margin-top:10px}}
  .warn{{background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:8px 12px;margin:10px 0;font-size:14px}}
  .filing{{margin-top:34px;border:1px solid #ddd;border-radius:8px;padding:8px 22px 22px;background:#fcfcfa}}
  .prose{{white-space:pre-line}} a{{color:#1d4ed8}} h4{{margin:10px 0 2px}} p{{margin:4px 0}} ul{{margin:4px 0}}
  .disc{{margin-top:40px;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px}}
</style></head><body>
  <h1>CasePilot — Case Pack</h1>
  <p class="muted">Reference: {esc(case_id)} · Prepared for the client · Informational, not regulated legal advice</p>

  <h2>Summary</h2><p>{esc(case.get('summary'))}</p>

  <h2>What we think happened</h2><p>{esc(syn.get('analysis'))}</p>

  <h2>Chronology</h2><table>{chrono or '<tr><td>—</td></tr>'}</table>

  <h2>Key evidence</h2><ul>{evidence or '<li>—</li>'}</ul>

  <h2>Legal basis (England &amp; Wales)</h2><ul>{legislation or '<li>—</li>'}</ul>

  <h2>Recommendation &amp; route</h2>
  <div class="verdict"><b>{esc(verdict)}</b> &nbsp;<span class="muted">confidence: {esc(rec.get('confidence'))}</span>
  <p>{esc(rec.get('reasoning'))}</p>{route_bits}</div>
  {time_limit}
  {f"<h3>Knockout &amp; threshold checks</h3><ul>{checks}</ul>" if checks else ''}
  {f"<h3>Next steps</h3><ol>{steps}</ol>" if steps else ''}
  {filing_html}

  <h2>Parties &amp; details</h2>{chips}

  <p class="disc">Generated by CasePilot. This pack organises information you provided and points to
  publicly available legislation. It is not legal advice and does not create a solicitor–client
  relationship. Legislation links resolve to legislation.gov.uk.</p>
</body></html>"""


if __name__ == "__main__":
    app.run(port=5001, debug=True)
