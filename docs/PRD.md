# The Firm — PRD

> *Your pocket law firm. Describe your problem; watch a team of AI specialists work your case and hand you a real next step.*

**Event:** Lawhive Hackathon 2026 · London · Sat 30 May 2026
**Status:** Build spec (v1) — hackathon MVP
**Primary track:** C — Case In A Box (spine) + B — Know Your Rights (headline output). Touches D (Negotiator / Letter Before Action) and E (Paperwork) as agent sub-tasks.

---

## 1. The problem we're solving

A consumer with a legal problem (here: a withheld tenancy deposit) faces three frictions the Lawhive pack names directly:

- **Recalibration** — they don't know if they even have a claim, what it's worth, or what pursuing it actually involves (Track B).
- **Intake is shallow** — generic forms collect vague info; nobody assembles the *story* with evidence (Track C).
- **The pre-action steps are invisible** — they don't know a Letter Before Action exists or what it must contain (Track D).

The result: people abandon valid claims, or barrel into bad ones, because the path is opaque and a lawyer feels like the only (unaffordable) option.

## 2. The product

The user brain-dumps their problem (voice / text / documents). A visible **firm of specialist AI agents** works the case in an interactive pixel-art environment, and produces:

1. An extracted **case profile** (parties, dates, addresses, amounts, keywords).
2. A **sourced chronology** built from documents + the user's email.
3. The **relevant law** (rights, statutes, limitation period) — cited, not vibed.
4. A **merit recommendation**: pursue *with a lawyer* / *without a lawyer* / *not worth it*, with a prospects score and reasoning.
5. A **case-brief pack** ready to hand a lawyer.
6. A **drafted Letter Before Action** — and the firm **actually sends it** (to a controlled demo inbox).

**The core insight (our point of view on access to justice):** the leap isn't a smarter chatbot — it's making AI legal work *legible and trustworthy*. You watch named specialists do the work and show their reasoning, which makes the user **more confident in their own judgement, not just more dependent on the tool** (the exact bar Track E sets).

## 3. How it scores against the four lenses

| Lens | Our play |
|---|---|
| **A — Access to Justice** (headline) | The Counsel agent's pursue-with/without/not call + a ready brief unlocks the person priced out of advice. Hero case resolves to **"pursue without a lawyer"** via the deposit scheme's free dispute service — a genuine access win. |
| **B — Agentic First** ("sending > drafting") | The firm drafts a **pre-action-protocol-compliant Letter Before Action and sends it** by email. Evidence-gathering also searches email — agents *act*, not chat. |
| **C — UX & Product** (breathing PoC, multimodal) | Pixel-art agent world + **voice** intake + **email** evidence = multimodal, meets people where they are. |
| **D — Legally Accurate** (real advice) | Researcher/Counsel grounded in real, curated authorities for the hero case (Housing Act 2004 ss.213–215, deposit-scheme ADR, fair-wear-and-tear, Limitation Act 1980). Citations + reasoning tied to claim elements. |

## 4. Scope (hackathon MVP)

**In:** one hero case, run end-to-end through a **real LLM pipeline**, visualised by the agent environment. Email/voice/legislation use **realistic canned data**; the LBA **send is real** (to a demo inbox).

**Out / stretch:** arbitrary open input · live Gmail OAuth · live legislation.gov.uk search · a 2nd case type (proves adaptive case-type recognition) · WhatsApp entry point · court-form generation (MCOL/N1).

### Hero case — Tenancy deposit dispute
- **Tenant:** Sarah Chen. **Property:** 14 Brindley Court, Manchester M1 4AB.
- **Agent/Landlord:** Northgate Lettings (agent) / Mr David Holloway (landlord).
- **Tenancy:** AST 1 Jun 2024 – 31 May 2025, rent £1,200/mo, **deposit £1,500** (protected in the TDS scheme).
- **Dispute:** landlord withholds the full £1,500 for cleaning, carpet "damage" (fair wear and tear), and repainting. Sarah left the flat clean, has check-in/check-out photos.
- **Resolution the firm reaches:** strong prospects on burden-of-proof + fair-wear-and-tear → **pursue without a lawyer**: raise a free dispute via the TDS scheme, escalate to small claims (MCOL, < £10k track) only if needed. Send an LBA to Northgate first.

**Synthetic evidence we author:** tenancy agreement (excerpt), check-out inventory, deposit-protection certificate, and an **email chain** (Sarah requests deposit → agent itemises deductions → Sarah disputes).

## 5. The agent pipeline

Each agent = one server-side LLM call returning **structured (Zod-typed) output**, streamed to the UI so avatar animations sync to real work.

| # | Agent | Input | Output (schema) |
|---|---|---|---|
| 1 | **Reception** | brain-dump (voice/text) | `CaseIntake` — caseType, summary, parties, userGoal |
| 2 | **Investigator** | intake + docs | `Entities` — people, orgs, addresses, dates, amounts, keywords, **thingsToLookFor** |
| 3 | **Evidence Gatherer** | thingsToLookFor | `EvidenceHits[]` — searches canned email for matching threads |
| 4 | **Chronologist** | docs + email hits | `Chronology[]` — `{date, event, source}` |
| 5 | **Researcher** | caseType + issues | `LegalResearch` — issues→`{citation, summary}`, rights, limitation |
| 6 | **Counsel** | everything above | `Assessment` — recommendation, prospectsScore, reasoning, risks, estValue, route |
| 7 | **Clerk** | everything above | `CaseBrief` — title, summary, parties, chronology, issues, evidenceIndex, nextSteps, **letterBeforeAction** |
| 8 | **Dispatch** | brief + LBA | sends LBA email → action result |

## 6. Architecture

```
Client (Next.js/React)                         Server (Next.js route handlers)
┌───────────────────────────┐                  ┌────────────────────────────────┐
│ Pixel-art agent environment│   SSE / stream   │ POST /api/run                  │
│  - avatars + stations      │ <══════════════  │  runs pipeline, emits per-agent│
│  - per-agent result panels │                  │  status + result events        │
│  - case-file object        │                  │   └ each agent: generateObject │
│ Outputs                    │                  │      (Claude via AI Gateway)   │
│  - brief view              │   POST           │ POST /api/send-lba             │
│  - LBA draft + Send button │ ════════════════>│  Resend → demo inbox           │
│ Intake (voice/text/upload) │                  │ lib/case-data (synthetic docs) │
└───────────────────────────┘                  └────────────────────────────────┘
```

- **Pipeline orchestration:** sequential server function; emits `{stage, status: 'start'|'done', result}` events over a streamed response. Client state machine: `idle → reception → … → done`.
- **Models:** Claude **Sonnet** for fast agents, **Opus** for Counsel (the high-stakes legal judgement) — via Vercel AI SDK + AI Gateway (`"anthropic/claude-..."` strings).
- **Structured output:** `generateObject` + Zod per agent. This is what makes outputs legible and the UI panels deterministic.

## 7. Tech stack

- **Next.js (App Router) + TypeScript**, deployed on **Vercel**
- **Vercel AI SDK** (`ai`) via **AI Gateway** → Claude (Sonnet/Opus); **Zod** schemas
- **Tailwind + shadcn/ui** for the shell
- **Pixel-art environment:** CSS sprite avatars + framer-motion tweens to start (upgrade path: PixiJS)
- **Voice:** browser Web Speech API (zero-dep) for the demo; Whisper as upgrade
- **Email send:** **Resend** to a controlled demo inbox
- **Docs:** synthetic case files in `lib/case-data` (no live parsing needed for MVP)

**Only credential required:** an AI Gateway/Anthropic key (`AI_GATEWAY_API_KEY` or `ANTHROPIC_API_KEY`) and a `RESEND_API_KEY` for the send action.

## 8. UX flow

1. **Landing / intake** — "Tell us what happened." Voice or text; optional document chips (pre-loaded for the demo).
2. **The Firm at work** — pixel-art office; the case file lands on Reception's desk and moves agent-to-agent. Each agent shows a working animation, a one-line "what I'm doing," then its result panel fills. ~6 beats, ~30–45s total.
3. **The verdict** — Counsel delivers the recommendation with a prospects dial and plain-English reasoning.
4. **Your pack** — the case brief (expandable sections) + the Letter Before Action with a prominent **Send** button. Sending shows a real confirmation.

## 9. Build phases

- **P0 — Scaffold:** Next.js + Tailwind + shadcn; deploy skeleton to Vercel. Add env keys.
- **P1 — Pipeline:** schemas + synthetic case data + the 8 agents as real LLM calls; verify end-to-end on a plain page (JSON in, structured out).
- **P2 — Environment:** streamed events + pixel-art agents + result panels wired to the live pipeline.
- **P3 — Outputs & action:** brief view + LBA draft + real Resend send.
- **P4 — Polish:** voice intake, legal-grounding pass, copy, the verdict moment.
- **P5 — Stretch:** 2nd case type · live email · court form · WhatsApp.

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Live integrations flake on stage | Canned email/voice/legislation; only the send is live, to a controlled inbox |
| Pipeline too slow for a live demo | Sonnet for most agents; stream so the user sees progress; cache the hero run |
| "AI waffle" undermines Lens D | Curated authorities + structured legal reasoning + cite-or-omit prompting |
| Pixel-art eats the whole day | Start with CSS sprites + motion; PixiJS only if time. UI degrades gracefully to a clean "agent dashboard" |
| Sending real email is irreversible | Send only to a demo inbox we own; never the real opposing party |

## 11. Success criteria (demo)

A judge watches: a messy spoken complaint → a firm of agents visibly work it → a cited, plain-English **"here's whether to pursue it and how"** → a sent Letter Before Action — in under two minutes, and believes a real person could use it.
