// Mirrors the CasePilot backend's mock responses exactly, so the offline replay
// shows the same content the live Flask backend returns. Used as a no-backend
// fallback and stage insurance.

import type { StageId, StageResults } from "./types";

export const DEMO_RESULTS: Required<StageResults> = {
  intake: {
    case_id: "demo1a2b",
    summary:
      "Tenant withholding deposit dispute. The client moved out of a rented flat in March and the landlord has refused to return the £1,450 deposit, citing cleaning and damage costs the client disputes.",
  },
  entities: {
    names: ["Mr. James Holloway (landlord)", "Sarah Bennett (client)", "QuickLet Agency"],
    dates: [
      "12 Jan 2024 — tenancy start",
      "03 Mar 2026 — move out",
      "18 Mar 2026 — deposit refused",
    ],
    keywords: [
      "deposit",
      "deposit protection scheme",
      "cleaning costs",
      "check-out report",
      "section 21",
    ],
    addresses: ["Flat 4B, 27 Elm Grove, Bristol, BS6 5DT"],
  },
  gmail: { status: "connected", emails_found: 12 },
  synthesis: {
    chronology: [
      { date: "12 Jan 2024", event: "Tenancy agreement signed; £1,450 deposit paid." },
      { date: "14 Jan 2024", event: "Deposit reportedly placed in a protection scheme (unconfirmed)." },
      { date: "03 Mar 2026", event: "Client moves out; flat left clean, photos taken." },
      { date: "18 Mar 2026", event: "Landlord emails refusing the deposit, claiming £900 in cleaning/damage." },
      { date: "21 Mar 2026", event: "Client disputes the deductions in writing; no response." },
    ],
    key_evidence: [
      { source: "Email — 18 Mar 2026", detail: "Landlord's written refusal listing disputed deductions." },
      { source: "Photos — 03 Mar 2026", detail: "Time-stamped photos of the cleaned flat at move-out." },
      { source: "Tenancy agreement", detail: "Signed contract showing the £1,450 deposit amount." },
      { source: "Bank statement", detail: "Record of the original deposit payment." },
    ],
    analysis:
      "The client has a strong prima facie deposit-protection claim. There is documentary evidence of the deposit amount, the move-out condition, and the landlord's refusal. A key open question is whether the deposit was protected in an approved scheme within 30 days, which would entitle the client to up to 3x the deposit in compensation.",
    legislation: [
      {
        title: "Housing Act 2004",
        provision: "ss. 213–214 (tenancy deposit protection)",
        relevance:
          "Requires the deposit to be protected within 30 days and allows a 1–3x penalty if not.",
        url: "https://www.legislation.gov.uk/ukpga/2004/34",
      },
    ],
  },
  recommend: {
    recommendation: "pursue_without_lawyer",
    confidence: "high",
    reasoning:
      "Deposit disputes under £5,000 are well suited to the small claims track and do not usually require a solicitor. The evidence is strong and the legal test is clear. The client can use the free deposit-protection scheme adjudication first, then small claims if needed. Escalate to a lawyer only if the landlord counterclaims for significant damages.",
  },
  pack: { pack_url: "https://example.com/casepilot/mock-case-pack.pdf" },
};

// Per-agent dwell time for the replay, so it feels like real work.
export const DEMO_DELAYS: Record<StageId, number> = {
  intake: 1300,
  entities: 1500,
  gmail: 1500,
  synthesis: 1900,
  recommend: 1800,
  pack: 1400,
};
