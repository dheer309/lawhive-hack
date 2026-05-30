# The Firm — interactive UI for CasePilot 🏛️

An interactive frontend that drives the **CasePilot** Flask pipeline and shows it as a
playable **Sims-style "Dunder Mifflin" office**: a cast of named agents (Pam, Dwight,
Jim, Angela, Michael, Oscar — The Office) work the case live at their desks while a
**case board** assembles itself on the right.

> This is the **UI layer** (Option A): a standalone Next.js app that calls the teammate's
> Flask backend. It lives on its own branch, separate from `main`'s `backend/` + `frontend/`.

## How it plugs into the backend

It calls the 6 CasePilot endpoints in sequence (threading `case_id`), animating an agent
per stage:

| Stage (Flask) | Agent | Board section |
|---|---|---|
| `POST /api/intake` | Pam · Reception | summary |
| `POST /api/extract-entities` | Dwight · Investigator | names / dates / keywords / addresses |
| `POST /api/connect-gmail` | Angela · Evidence | "N emails found" |
| `POST /api/synthesize` | Jim · Synthesis | timeline + key evidence + summary |
| `POST /api/recommend` | Michael · Counsel | verdict (recommendation + confidence) |
| `POST /api/generate-pack` | Oscar · Clerk | case-pack download |

The client lives in `src/lib/api.ts`. If a call fails (backend down), it **auto-falls-back
to a canned demo** that mirrors the backend's mock responses, so the UI always runs.

## Run it

```bash
npm install
# point at the running Flask backend (default shown):
echo "NEXT_PUBLIC_BACKEND_URL=http://localhost:5001" > .env.local
npm run dev    # http://localhost:3000
```

Then start the backend (`backend/app.py` on `main`) on port 5001. With no backend, click
**"Watch the worked demo"** for the canned run.

## How the office art was made

Real Sims 1 character sprites were rendered from a Blender `.blend` (headless, transparent
isometric PNGs) into `public/characters/`. The room, furniture, plumbob, bubbles and case
board are SVG/React + framer-motion. The `.blend` itself is gitignored.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · framer-motion · TypeScript.

See [`docs/PRD.md`](docs/PRD.md) for the full product spec, and `docs/` for the hackathon
brief + judging criteria.
