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
- **`public/characters/*.png` are now SEATED** (rendered by `scripts/render_seated.py`).
  Standing variants come from `scripts/render_chars.py` (kept as fallback; restore with
  `git checkout public/characters` or from `/tmp/standing_backup` if it survived).
- **Seated technique** (the cast meshes are static — no armatures): only 3 Sims are rigged
  (`Rigged Michelle`=adult ♀, `Rigged Burglar`=adult ♂, `Rigged Daniel`=child). `render_seated.py`
  copies skin weights from the body-type-matching rigged mesh onto each cast mesh by
  nearest-vertex (KDTree, shared Sims base-body local space), binds to the rig, poses it
  seated (thigh +75°, shin −85°, spine1 −12° about bone-local X; +Z up, body faces −Y), and
  renders all 6 at a **shared ortho scale**, then they're cropped to a shared alpha bbox so
  feet-baseline + scale stay uniform. Body type picked by mesh width: 1.50≈♀ rig, 1.56+≈♂ rig.
- `scripts/inspect_rigs.py` dumps armatures/bones + which meshes are skinned (use to re-derive
  the casting). `scripts/inspect_blend.py` dumps the full scene graph.
- **Blender** was downloaded portably (no install): `/tmp/blender.dmg` (4.2.9 arm64) →
  copied to `/tmp/Blender.app` (de-quarantined). Both are in `/tmp` so may vanish on reboot —
  re-mount the dmg or re-download `https://download.blender.org/release/Blender4.2/blender-4.2.9-macos-arm64.dmg`.
- Run: `/tmp/Blender.app/Contents/MacOS/Blender -b "The sims characters release.blend" --python scripts/render_seated.py`
  (output → `/tmp/seated_out`, then crop+install via the PIL one-liner in git history, or
  point `SEATED_OUT` at a dir). `Office.tsx` pulls the desk up over the seated lap with
  `-mt-[72px]` (was `-mt-9` for standing).

## Decisions / gotchas
- Visual direction: Sims-1 "Dunder Mifflin" office (per user refs). **No pixel art** (user
  dislikes it). Bright look was muted to grey carpet / sage+cream walls.
- Casting names = The Office (Pam, Dwight, Jim, Angela, Michael, Oscar).
- Office floor plan (`Office.tsx` `DESKS`): two **staggered** rows of three — the front row is
  offset ~0.8 col so each back desk sits in the GAP between two front desks. This is deliberate:
  it stops the front row from covering the back row's nameplates and breaks the grid look. Room
  bounds (`A/B/C/D`), carpet ranges, `FURNITURE` (in `officeFurniture.tsx`), and the container
  `scale(0.9)` are all tuned to that spread — change them together.
- Dev server: deleting `.next` while running corrupts it — restart cleanly (`pkill -f "next dev"; rm -rf .next; npm run dev`).
- `.env*` is gitignored except `.env.example`.

## Done
Pipeline integration, board, office (furnished, Sims sprites, plumbob/bubble/case-file),
demo fallback, names, README. **Seated character poses** (weight-transfer rig, see above) —
all 6 agents now sit at their desks; verified across done/active/pending states via the
worked-demo path. (Commit pending — uncommitted: 6 seated PNGs, `Office.tsx` desk offset,
`scripts/render_seated.py` + `scripts/inspect_rigs.py`.)

## Next (not done)
1. **Live end-to-end test** against the actual running Flask backend (only the canned/replay
   path is verified so far; backend wasn't running this session).
2. Optional polish: arms-forward "typing" seated pose (currently arms rest at sides); refine
   cubicle divider placement; reception desk; nameplate crowding on the front row.
