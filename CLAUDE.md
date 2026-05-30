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
/frontend           React + Vite + Tailwind, dark themed
  src/
    App.jsx         Pipeline orchestrator — owns all stage state
    api.js          fetch wrapper -> /api proxied to Flask
    components/
      Stage.jsx         Shared shell (number badge, lock/grey-out, spinner)
      Intake.jsx        Stage 1
      Entities.jsx      Stage 2
      GmailConnect.jsx  Stage 3
      Synthesis.jsx     Stage 4
      Recommendation.jsx Stage 5
      DocumentPack.jsx  Stage 6
      AgentView.jsx     Pixel-art agent host (owned by strategy consultant)
```

## Pipeline stages (and their routes)

1. **Intake** — `POST /api/intake` `{transcript, files}` -> `{case_id, summary}`
2. **Entities** — `POST /api/extract-entities` `{case_id}` -> `{names, dates, keywords, addresses}`
3. **Gmail Connect** — `POST /api/connect-gmail` `{case_id}` -> `{status, emails_found}`
4. **Synthesis** — `POST /api/synthesize` `{case_id}` -> `{chronology, key_evidence, case_summary}`
5. **Recommendation** — `POST /api/recommend` `{case_id}` -> `{recommendation, confidence, reasoning}`
6. **Document Pack** — `POST /api/generate-pack` `{case_id}` -> `{pack_url}`

Every route currently returns hardcoded mock data and logs the request body.
Replace one route's body with real logic at a time — the frontend already drives
the full flow end to end.

## Running locally

Backend (port 5001):
```
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Frontend (port 5173, proxies /api -> :5001):
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
