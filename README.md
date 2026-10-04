# Mega Agentic System

A full-stack, multi-pattern AI platform built on Google Gemini — task orchestration,
code/document/image/video generation, text-to-speech, **real-time voice chat (Gemini
Live)**, music generation, and a research/RAG workbench, all behind one Next.js UI.

**Bring-your-own-key (BYOK):** the servers hold **no** API key. Each visitor pastes
their own Gemini key into the UI; it's stored only in their browser and sent with each
request. Share the app with friends and everyone runs on their own quota.

## Features

- **Orchestrator** — one engine that picks an execution pattern per task from **13**
  modes, and reports every agent step as a structured event: who ran, in which
  dependency batch, with the prompt and response behind each one.
  - *Multi-agent:* hierarchical, swarm, debate, negotiate, red/blue, reflective,
    meta-learning, socratic, background
  - *Building blocks:* chain, routing, parallel, evaluator
  - **Hierarchical** decomposes a task into sub-tasks, mints a specialist agent for
    each, and runs them concurrently in dependency order rather than one at a time.
- **Workflows** — every pattern on the Workflows page is deployable: pick one, give it a
  task, and watch it execute against the live orchestrator with its agent timeline.
- **orch5 (multi-team)** — a separate hierarchical system: an orchestrator designs teams
  from your goal, each team lead plans and dispatches domain-locked workers in parallel,
  and the files they write come back with the result.
- **Code / Documents / Images** — generate, review, refactor, translate, summarize;
  audio transcription with speaker diarization; Imagen + Gemini image editing and
  "nano-banana" multi-image generation.
- **Video** — Veo 3.1 text/image-to-video, interpolation, extension, and Omni editing.
- **Speech** — Gemini TTS (single + multi-speaker) and **Gemini Live**: real-time,
  interruptible voice conversations from your mic.
- **Music** — Lyria 3 Clip (30s) and Pro (full song), **Lyria 3.5** (full-length songs
  with vocals, lyrics and parsed song structure, optionally composed from images), plus
  interactive **Lyria RealTime** streaming.
- **Research / RAG** — arXiv, PubMed and Wikipedia search, **Google Search grounding**,
  **Google Maps grounding**, an agentic research orchestrator, a **streaming** assistant
  that shows its tool calls as it makes them, and a document knowledge base.
- **CSV completion** — AI-assisted fill-in for missing cells.

## Architecture

- `backend/` — Python **FastAPI** service wrapping the Gemini-based orchestrator and all
  feature endpoints. Per-request Gemini clients are built from the caller's
  `X-Gemini-Key` header (or `?key=` on WebSockets). See `backend/` and `CLAUDE.md`.
- `frontend/` — **Next.js 16** (App Router) + React 19 + Tailwind v4 UI. `lib/api.ts` is
  the single API client and attaches the key to every request.

Two Gemini API surfaces are in use. Most features call `generate_content`; the pieces
that need tool-streaming or audio interactions — the streaming assistant, Maps
grounding and Lyria 3.5 — use the **Interactions API** instead.

Long-running work never blocks the server: request handlers that call the model are
synchronous so FastAPI runs them in its threadpool, and the orchestrator's task
execution happens in background tasks that the UI polls.

## Local development

Requires a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
and **Node 24.19+** (the frontend pins this in `engines`; Vercel and CI build on 24.x).

**Docker (both services):**

```bash
docker compose up --build
# open http://localhost:3000, click "Add API Key", paste your key
```

**Or run each directly:**

```bash
# backend (from backend/)
uv sync
uv run uvicorn api_server:app --reload --port 8010

# frontend (from frontend/)
npm install
npm run dev   # http://localhost:3000
```

Create `frontend/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:8010`.

> Gemini Live needs a **secure context** for microphone access — use `http://localhost`,
> not a `http://192.168.x` LAN IP. It works in production over HTTPS.

## Deployment

Frontend → **Vercel**, backend → **Render** (Docker). No API-key secrets to configure
(BYOK). Full step-by-step in **[`DEPLOY.md`](./DEPLOY.md)**; the `render.yaml` blueprint
provisions the backend.

`GET /health` reports the running build's git commit, so you can tell at a glance
whether a deploy actually shipped.

Both hosts have an ephemeral filesystem and the backend keeps task history in memory, so
a deploy or an idle spin-down clears past tasks and any files written on disk. Anything
that needs to survive travels in the API response.

## Environment variables

| Var | Where | Notes |
|-----|-------|-------|
| `NEXT_PUBLIC_API_URL` | frontend build | URL of the backend (e.g. `https://…onrender.com`) |
| `GEMINI_API_KEY` | backend (optional) | Local-dev fallback only; unused in BYOK/cloud |

## Models

Defined in `backend/main.py`; swap them there.

| Role | Model |
|------|-------|
| Default | `gemini-3.5-flash` |
| Complex / planning | `gemini-3.1-pro-preview` |
| Lite | `gemini-3.1-flash-lite` |
| Music | `lyria-3.5`, `lyria-3-clip-preview`, `lyria-3-pro-preview`, `lyria-realtime-exp` |

## Docs

- [`DEPLOY.md`](./DEPLOY.md) — Render + Vercel deployment
- [`BYOK_PLAN.md`](./BYOK_PLAN.md) — the bring-your-own-key design + rollout
- [`CLAUDE.md`](./CLAUDE.md) — architecture notes and conventions
