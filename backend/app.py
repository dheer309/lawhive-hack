"""CasePilot backend — thin Flask API.

Every route returns a hardcoded mock response for now. Replace the body of each
route with real logic one at a time; the frontend already drives the full flow.
"""

import logging
import uuid

from flask import Flask, jsonify, request
from flask_cors import CORS

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
log = logging.getLogger("casepilot")

app = Flask(__name__)
CORS(app)


def _body():
    """Best-effort JSON body, logged so we can see what the frontend sent."""
    data = request.get_json(silent=True) or {}
    log.info("%s  %s", request.path, data)
    return data


@app.post("/api/intake")
def intake():
    """Accepts { transcript, files } -> { case_id, summary }."""
    _body()
    return jsonify(
        case_id=uuid.uuid4().hex[:8],
        summary=(
            "Tenant withholding deposit dispute. The client moved out of a rented "
            "flat in March and the landlord has refused to return the £1,450 deposit, "
            "citing cleaning and damage costs the client disputes."
        ),
    )


@app.post("/api/extract-entities")
def extract_entities():
    """Accepts { case_id } -> { names, dates, keywords, addresses }."""
    _body()
    return jsonify(
        names=["Mr. James Holloway (landlord)", "Sarah Bennett (client)", "QuickLet Agency"],
        dates=["12 Jan 2024 — tenancy start", "03 Mar 2026 — move out", "18 Mar 2026 — deposit refused"],
        keywords=["deposit", "deposit protection scheme", "cleaning costs", "check-out report", "section 21"],
        addresses=["Flat 4B, 27 Elm Grove, Bristol, BS6 5DT"],
    )


@app.post("/api/connect-gmail")
def connect_gmail():
    """Accepts { case_id } -> { status, emails_found }."""
    _body()
    return jsonify(status="connected", emails_found=12)


@app.post("/api/synthesize")
def synthesize():
    """Accepts { case_id } -> { chronology, key_evidence, case_summary }."""
    _body()
    return jsonify(
        chronology=[
            {"date": "12 Jan 2024", "event": "Tenancy agreement signed; £1,450 deposit paid."},
            {"date": "14 Jan 2024", "event": "Deposit reportedly placed in a protection scheme (unconfirmed)."},
            {"date": "03 Mar 2026", "event": "Client moves out; flat left clean, photos taken."},
            {"date": "18 Mar 2026", "event": "Landlord emails refusing the deposit, claiming £900 in cleaning/damage."},
            {"date": "21 Mar 2026", "event": "Client disputes the deductions in writing; no response."},
        ],
        key_evidence=[
            {"source": "Email — 18 Mar 2026", "detail": "Landlord's written refusal listing disputed deductions."},
            {"source": "Photos — 03 Mar 2026", "detail": "Time-stamped photos of the cleaned flat at move-out."},
            {"source": "Tenancy agreement", "detail": "Signed contract showing the £1,450 deposit amount."},
            {"source": "Bank statement", "detail": "Record of the original deposit payment."},
        ],
        case_summary=(
            "The client has a strong prima facie deposit-protection claim. There is "
            "documentary evidence of the deposit amount, the move-out condition, and the "
            "landlord's refusal. A key open question is whether the deposit was protected "
            "in an approved scheme within 30 days, which would entitle the client to up "
            "to 3x the deposit in compensation."
        ),
    )


@app.post("/api/recommend")
def recommend():
    """Accepts { case_id } -> { recommendation, confidence, reasoning }."""
    _body()
    return jsonify(
        recommendation="pursue_without_lawyer",
        confidence="high",
        reasoning=(
            "Deposit disputes under £5,000 are well suited to the small claims track and "
            "do not usually require a solicitor. The evidence is strong and the legal test "
            "is clear. The client can use the free deposit-protection scheme adjudication "
            "first, then small claims if needed. Escalate to a lawyer only if the landlord "
            "counterclaims for significant damages."
        ),
    )


@app.post("/api/generate-pack")
def generate_pack():
    """Accepts { case_id } -> { pack_url }."""
    _body()
    return jsonify(pack_url="https://example.com/casepilot/mock-case-pack.pdf")


if __name__ == "__main__":
    app.run(port=5001, debug=True)
