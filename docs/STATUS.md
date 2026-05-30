# The Firm — project status / handoff

_Snapshot for resuming in a fresh session._

## What this is
The **interactive UI layer** for **CasePilot** (Lawhive Hackathon 2026). A standalone
Next.js app that drives the teammate's Flask backend and renders it as a playable
**Sims-1 / "Dunder Mifflin" isometric office**: six agents (named after The Office) work
the case live at their desks while a **case board** assembles on the right.

- **Local path:** `/Users/foomingli/Documents/Lawhive-hackathon`
- **Pushed to:** `dheer309/lawhive-hack`, branch **`feat/interactive-ui`** (separate history
  from `main`; it's the frontend only — runs *against* `main`'s `backend/`).
- **Integration choice (Option A):** keep this as a separate Next.js frontend that calls the
  Flask backend over HTTP (CORS is on). Not merged into their `frontend/`.

## Run
```bash
npm install
echo "NEXT_PUBLIC_BACKEND_URL=http://localhost:5001" > .env.local
npm run dev            # http://localhost:3000  (a dev server may already be on :3210)
```
Backend is `backend/app.py` on `main` (Flask, port 5001). With no backend, the UI
auto-falls-back to a canned demo — click **"Watch the worked demo"** on the landing page.

## Backend contract (CasePilot — 6 stages, called in order, threading `case_id`)
| Stage | Agent (role · The Office name) | Returns |
|---|---|---|
| `POST /api/intake` `{transcript,files}` | Reception · **Pam** | `{case_id, summary}` |
| `POST /api/extract-entities` `{case_id}` | Investigator · **Dwight** | `{names, dates, keywords, addresses}` |
| `POST /api/connect-gmail` `{case_id}` | Evidence · **Angela** | `{status, emails_found}` |
| `POST /api/synthesize` `{case_id}` | Synthesis · **Jim** | `{chronology, key_evidence, case_summary}` |
| `POST /api/recommend` `{case_id}` | Counsel · **Michael** | `{recommendation, confidence, reasoning}` |
| `POST /api/generate-pack` `{case_id}` | Clerk · **Oscar** | `{pack_url}` |

## File map
- `src/lib/api.ts` — Flask client (`NEXT_PUBLIC_BACKEND_URL`, default `:5001`, 12s timeout).
- `src/lib/types.ts` — `StageId` + response types.
- `src/lib/useFirmRun.ts` — sequential orchestrator; per-stage fallback to canned data; full
  replay if intake fails. State: statuses/results/active/demo.
- `src/lib/demo-replay.ts` — canned results mirroring the backend's mock responses (Bristol
  deposit case). `src/lib/case-data.ts` — intake demo transcript + doc chips.
- `src/lib/agents.ts` — the 6-agent cast metadata (id, name, title, working line, accent).
- `src/components/Office.tsx` — the isometric room (carpet, sage/cream walls, blind windows,
  CRT desks, door, puddle) + workstations (character sprite + plumbob + bubble + nameplate)
  + travelling case file.
- `src/components/officeFurniture.tsx` — iso furniture (plant, cabinet/dresser, cooler,
  bookshelf, lamp, coffee table, chair, white-slat dividers) + `FURNITURE` placement list.
- `src/components/CaseBoard.tsx` — assembling dossier; sections per stage; `board/Verdict.tsx`
  (recommendation + confidence dial), `board/PackPanel.tsx` (download pack_url).
- `src/components/Intake.tsx` — landing (text + Web Speech voice + doc chips + demo button).
- `src/components/CharacterAvatar.tsx` — SVG fallback busts (used on `/cast` preview page).
- `public/characters/{intake,entities,gmail,synthesis,recommend,pack}.png` — Sims sprites.

## Character sprites (rendered from Blender)
- Source: `The sims characters release.blend` (in project root + `~/Downloads`; **gitignored**,
  6.9 MB, Blender 3.01). Full Sims-1 roster (Goth/Newbie/Pleasant/NPCs + 3 rigged).
- Casting (agent ← Sims mesh): intake←Betty Newbie, entities←Bob Newbie, gmail←Bella Goth,
  synthesis←chris roomies, recommend←mortimer Goth (suit), pack←Michael Bachelor.
- Re-render: `scripts/render_chars.py` (ortho iso cam, transparent PNG, stands the
  Y-up models upright). `scripts/inspect_blend.py` dumps the scene graph.
- **Blender** was downloaded portably (no install): `/tmp/blender.dmg` (4.2.9 arm64) →
  copied to `/tmp/Blender.app` (de-quarantined). Both are in `/tmp` so may vanish on reboot —
  re-mount the dmg or re-download `https://download.blender.org/release/Blender4.2/blender-4.2.9-macos-arm64.dmg`.
- Run: `/tmp/Blender.app/Contents/MacOS/Blender -b "The sims characters release.blend" --python scripts/render_chars.py`

## Decisions / gotchas
- Visual direction: Sims-1 "Dunder Mifflin" office (per user refs). **No pixel art** (user
  dislikes it). Bright look was muted to grey carpet / sage+cream walls.
- Casting names = The Office (Pam, Dwight, Jim, Angela, Michael, Oscar).
- Dev server: deleting `.next` while running corrupts it — restart cleanly (`pkill -f "next dev"; rm -rf .next; npm run dev`).
- `.env*` is gitignored except `.env.example`.

## Done
Pipeline integration, board, office (furnished, Sims sprites, plumbob/bubble/case-file),
demo fallback, names, committed + pushed to `feat/interactive-ui`, README.

## Next (not done)
1. **Seated character poses** — re-render the *rigged* Sims (Rigged Michelle/Daniel/Burglar
   have armatures) sitting at desks. More involved (pose bones in Blender).
2. **Live end-to-end test** against the actual running Flask backend (only the canned/replay
   path is verified so far).
3. Optional polish: refine cubicle divider placement, scale characters, reception desk.
