# The Firm 🏛️

**Your pocket law firm.** Describe your problem — by voice or text — and watch a team of
AI specialists work your case in front of you, then hand you a real next step.

Built for the **Lawhive Hackathon 2026** (London, 30 May 2026).
Primary track: **C — Case In A Box**, with **B — Know Your Rights** as the headline output.

---

## What it does

A consumer brain-dumps a legal problem (the demo: a withheld tenancy deposit). A visible
cast of seven AI agents works the case live on an **assembling case board**:

| Agent | Does |
|------|------|
| 🛎️ **Mara** — Reception | Identifies the case type, captures a clean intake |
| 🔎 **Vince** — Investigator | Extracts people, dates, addresses, amounts; decides what to look for |
| 📬 **Posy** — Evidence | Searches the connected emails/documents for proof |
| 🕰️ **Theo** — Chronologist | Builds a sourced timeline |
| 📚 **Iris** — Legal Research | Finds the law that applies — **cited, not guessed** |
| ⚖️ **Howard** — Counsel | Verdict: pursue *with a lawyer / without / not at all* + prospects score |
| 🗂️ **Quill** — Clerk | Assembles the case pack and drafts a Letter Before Action |

Then the firm **actually sends** the Letter Before Action (to a controlled demo inbox).

## How it scores

- **Access to justice** — a clear "should I pursue this, and how" for someone priced out of advice.
- **Agentic** — the agents *do things*: search email, draft, and **send** a real letter.
- **UX** — a breathing product: voice intake, a live cast, an assembling dossier.
- **Legally accurate** — grounded in real UK law (Housing Act 2004 ss.213–215, the deposit-scheme
  dispute route, fair wear and tear / betterment, Limitation Act 1980).

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

Out of the box it runs in **demo replay** (no key needed) — click *"Watch the worked demo"*.

To run the **live AI pipeline**, copy `.env.example` → `.env.local` and add an
**`AI_GATEWAY_API_KEY`** (from Vercel AI Gateway). To send the Letter Before Action for real,
also set **`RESEND_API_KEY`** and **`DEMO_INBOX`** (your Resend account email).

```bash
cp .env.example .env.local   # then fill in the keys
```

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · Vercel AI SDK v6 (`generateText` +
`Output.object`) → Claude via AI Gateway (Opus 4.8 for Counsel, Sonnet 4.6 elsewhere) ·
Zod · framer-motion · Resend.

## Architecture

- `src/lib/pipeline.ts` — the seven agents, run in sequence as structured LLM calls.
- `src/app/api/run` — streams per-agent events (NDJSON) to the client.
- `src/lib/useFirmRun.ts` — consumes the stream; auto-falls-back to demo replay if there's no key.
- `src/components/Studio.tsx` — the cast at work, with the case file moving between them.
- `src/components/CaseBoard.tsx` — the dossier that assembles itself, section by section.
- `src/app/api/send-lba` — sends the Letter Before Action via Resend (to a safe demo inbox).

See [`docs/PRD.md`](docs/PRD.md) for the full product spec.
