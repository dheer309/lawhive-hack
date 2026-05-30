# CasePilot

Legal-tech hackathon project (access to justice, UK). CasePilot helps everyday
people who have a legal problem but don't know where to start: they dump what they
know (voice transcript, texts, PDFs, emails), and a pipeline of agents extracts the
key facts, searches their Gmail for evidence, synthesises a chronology + evidence
map, looks up relevant law, and gives an honest recommendation on whether to pursue
the case — then generates a lawyer-ready document pack.

## Architecture

```
/backend            Flask API (thin mock routes — replace bodies one at a time)
  app.py
  requirements.txt
/frontend           "The Firm" — Next.js 16 + React 19 + Tailwind 4 + framer-motion
  src/
    app/page.tsx          Orchestrates: idle (Intake) → interview → running/done (Office + CaseBoard)
    lib/
      api.ts              fetch client -> backend (absolute URLs; multipart intake/clarify)
      types.ts            backend response shapes
      useFirmRun.ts       run state machine: interactive intake interview, then auto-run stages
      agents.ts           the firm's cast (one agent per stage)
      voice.tsx           browser Web Speech dictation (DictateButton)
      demo-replay.ts      canned hero results — no-backend fallback
    components/
      Intake.tsx          Landing: voice/text dump
      Interview.tsx       Follow-up loop: question / confirm / document + dictation + Gmail search
      Office.tsx          Pixel-art office; agents animate per stage status
      CaseBoard.tsx       Assembling results board (entities, gmail, synthesis, evidence, legislation)
      board/Verdict.tsx   Recommendation gauge + route / checks / time-limit / next steps
      board/PackPanel.tsx Link to the ready-to-file pack
```

The frontend talks to the backend directly via CORS (no proxy). It auto-runs the
pipeline as an animated "office": intake is interactive (the interview), then the
remaining stages run automatically with per-stage fallback to `demo-replay`.
Override the backend host with `NEXT_PUBLIC_BACKEND_URL` (defaults to `:5001`).

## Pipeline stages (and their routes)

- **Voice** — `POST /api/transcribe` multipart `audio` -> `{transcript}` (OpenAI Whisper)
1. **Intake** — conversational; the landing dump is [Intake.tsx](frontend/src/components/Intake.tsx) and the follow-up loop is [Interview.tsx](frontend/src/components/Interview.tsx) (driven by [useFirmRun.ts](frontend/src/lib/useFirmRun.ts)). Both routes are **multipart** so document files upload alongside text:
   - `POST /api/intake` (form: `transcript`, `files[]`) -> `{case_id, summary, ready, requests[]}`
   - `POST /api/clarify` (form: `case_id`, `responses` JSON, `files[]`) -> `{summary, ready, requests[]}` — folds answers + newly uploaded docs into the running transcript and re-assesses; capped at `MAX_CLARIFY_ROUNDS` (3) so it always terminates
   - **Uploaded files are read** (`extract_text` / `ingest_files`: PDF via pypdf, text formats decoded) and embedded in the transcript so the assessment mines them and never re-asks what they contain.
   - `assess_intake` returns one **ordered** `requests[]` list of `{kind, label, why, value}` — only things not already known. `kind` is `question` (typed/dictated), `confirm` (agent proposes `value`; user taps Yes/No — used whenever it can infer the answer, to minimise typing), or `document` (file upload). Order: (a) personal baseline **one item per fact** (name, email, age, nationality, residence), each only if missing, as `confirm` where inferable else `question`; (b) `document` requests for evidence immediately relevant to what's provided (booking confirmation → boarding pass, rejection email, flight-tracker screenshot); (c) remaining fact/"search-anchor" questions, preferring `confirm` where a value is inferable. `ready=true` with empty `requests` when nothing material is missing.
   - The Interview renders each request inline: `question` → textarea + 🎙️ dictation (browser Web Speech); `confirm` → "We have: …" with Yes/No (No reveals an editable box, default Yes = accept); `document` → upload / "can't find" + a Gmail-search fallback. When `ready`, the firm auto-runs the remaining stages.
2. **Entities** — `POST /api/extract-entities` `{case_id}` -> `{names, dates, keywords, addresses}`
3. **Gmail Connect** — `POST /api/connect-gmail` `{case_id}`. Real Google OAuth + Gmail search when `GOOGLE_CLIENT_ID/SECRET` are set, else a mock (`configured:false`). Flow: first call returns `{status:"needs_auth", auth_url}`; the UI opens it, the user consents, Google redirects to `GET /api/gmail/callback` (stores creds on the case); the next call searches the inbox with a query built from the extracted entities (`build_gmail_query`), folds the found email bodies into the transcript, and returns `{status:"connected", emails_found, results[]}`. PKCE: the code verifier is stashed in `GMAIL_VERIFIERS` when the auth URL is built and restored at the callback. Surfaced in the Interview (search fallback) and the CaseBoard Gmail section (`onConnectGmail`).
4. **Synthesis** — `POST /api/synthesize` `{case_id}` -> `{chronology, key_evidence, analysis, legislation}`
   - `chronology[]`: `{date, event, evidence_ids[]}` — `evidence_ids` reference `key_evidence[].id` (E1, E2…)
   - `key_evidence[]`: `{id, source, detail}`
   - `analysis`: detailed plain-English narrative of what happened (strengths/weaknesses/open questions)
   - `legislation[]`: `{title, provision, relevance, url}` — `url` is a verified legislation.gov.uk link
5. **Recommendation** — `POST /api/recommend` `{case_id}` -> `{recommendation, confidence, reasoning}`
6. **Document Pack** — `POST /api/generate-pack` `{case_id}` -> `{pack_url}`; served as HTML at `GET /api/pack/<case_id>`. `draft_deliverables` produces a **lean, do-it-for-you** pack (no law/citations): where/how to file + form field values, a plain-English statement to paste, fully-**drafted emails** ready to send, an evidence bundle split into gathered vs needed-from-you, and a short list of **client-only actions**. The recommendation's `next_steps` are likewise client-only — CasePilot prepares everything it can (emails, submission, bundle).

### How the backend works now

- **Real Claude** (`claude-opus-4-8`, adaptive thinking + structured outputs) drives intake,
  entities, synthesis, and recommendation. State is held per `case_id` in an in-memory
  `CASES` dict (no DB) — each stage reads what earlier stages stored.
- **Legislation is grounded, not hallucinated:** Claude proposes Acts/sections; the backend
  verifies each against the **legislation.gov.uk** Atom feed and attaches the canonical URL.
- **Resilience:** every stage falls back to a coherent deposit-dispute mock if the model call
  fails (missing key, network) so a live demo never hard-breaks — failures are logged loudly.
- **Voice** uses OpenAI Whisper; without `OPENAI_API_KEY` the `/api/transcribe` route returns
  503 and the UI tells the user to type instead.
- **Gmail** is still mocked — wiring deferred.

### Env (`backend/.env`, gitignored — see `.env.example`)

Auth goes through the **Lawhive hackathon gateway**, not api.anthropic.com:
- `ANTHROPIC_BASE_URL=https://ai.hack.lawhive.co.uk`
- `ANTHROPIC_AUTH_TOKEN=sk-...` — bearer token (NOT `api_key`; don't also set `ANTHROPIC_API_KEY`)
- `ANTHROPIC_MODEL=vertex_ai/claude-opus-4-7` — the **only** model the gateway routes
- `OPENAI_API_KEY` — optional, enables voice transcription

Gateway caveats baked into the code: it **silently ignores `output_config.format`**
(Vertex doesn't enforce JSON schemas), so `claude_json()` instructs the schema in
the prompt and parses the reply; `cache_control` and experimental betas are avoided.

## Running locally

Backend (port 5001):
```
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Frontend — Next.js, port 3000 (calls the backend at :5001 directly via CORS):
```
cd frontend
npm install
npm run dev
```

## Conventions / boundaries

- **Keep it simple.** No auth, no DB, no abstractions beyond what's here. Move fast.
- **AgentView.jsx is owned by the strategy consultant.** Its only contract is a
  single `stage` prop: `idle | extracting | searching | synthesising | recommending | packing`.
  Don't add props or reach into it. App.jsx maps the running stage to that prop.
- **Stage gating** lives entirely in App.jsx via `step` (completed-stage count).
  A stage N is `locked` when `step < N-1` and `done` when `step >= N`.
- **Legal framing** (recommendation prompt, document-pack content, avoiding
  regulated-advice language) is owned by the lawyer teammate — coordinate before
  changing the wording returned by `/api/recommend` or `/api/generate-pack`.

## Judging criteria to optimise for

Access-to-justice impact · agentic behaviour (does things in the world, not just
chat) · user experience · legal accuracy.
