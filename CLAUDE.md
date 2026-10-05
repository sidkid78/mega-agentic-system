# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Two deployable apps live side by side at the repo root; the many `.py`, `.md`, and `.html` files outside `backend/` and `frontend/` are scratch/experiments and should generally be ignored unless the user references them by name.

- `backend/` — Python FastAPI service ("Mega Agentic System") wrapping a Gemini-based multi-pattern agent orchestrator.
- `frontend/` — Next.js 16 (App Router) + React 19 + Tailwind v4 UI that talks to the backend.
- `start-servers.ps1` — convenience launcher; opens two PowerShell windows running backend (port 8010) and frontend (port 3000).

## Common commands

### Backend (run from `backend/`)
- Install deps: `uv sync`
- Dev server (auto-reload): `uv run uvicorn api_server:app --reload --host 0.0.0.0 --port 8010`
- Or: `uv run python api_server.py`
- Run a single test: `uv run pytest test_csv.py::<test_name>` (pytest is the test runner; suite is currently very thin — `test_csv.py`, `quick_test.py`)
- Standalone smoke test of the orchestrator: `uv run python quick_test.py`
- Required env var: `GEMINI_API_KEY` (some modules also accept `GOOGLE_API_KEY` via the `google-genai` SDK default).

### Frontend (run from `frontend/`)
- Install: `npm install`
- Dev: `npm run dev` (Next.js, port 3000)
- Production build: `npm run build` then `npm start`
- Lint: `npm run lint`
- Env: create `frontend/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:8010`

## Architecture

### Backend — Mega Agentic System

The core abstraction is `MegaAgenticSystem` in `backend/mega_agentic_system.py`. It is a single orchestrator that picks one of **13 execution modes** (`AgentMode` enum) per task — hierarchical, swarm, debate, negotiate, red_blue, reflective, meta_learning, background, socratic, plus the building-block patterns chain, routing, parallel and evaluator. Each mode is a private `_<mode>` method (`_hierarchical`, `_swarm`, …) that calls Gemini through `_call_model`. `execute(task)` selects a mode, runs it, and records an `ExecutionResult` (quality_score, mode_used, agents_involved, iterations). State is persisted to `mega_system_state.pkl` between API server runs; `load_state` merges saved metrics into the defaults, so a pickle written before a mode existed stays loadable.

Modes own their agents. `_swarm` samples the shared pool (`self.agents`), `_hierarchical` decomposes the task and mints a dedicated agent per sub-task — running them concurrently in dependency batches — and the rest declare their roles inline. There is no shared pre-allocated slice handed to every mode.

Every step is reported as a structured `AgentEvent` (agent identity and origin, phase, sub-task, batch, prompt, response, score, duration) via `self.events` and the optional `event_sink` callback. `api_server` streams those into `task_store` so the UI renders real agent activity rather than inferring it from log text.

`backend/api_server.py` is the public surface. It exposes the orchestrator at `POST /tasks` (executed in `BackgroundTasks`; status polled via `GET /tasks/{id}` and structured logs/agent cards via `GET /tasks/{id}/logs`) plus feature-specific endpoints for image generation (`/images/*` — `image_generation.py`, Imagen + Gemini edit), document generation (`/documents/*` — `document_generation.py`), code generation (`/code/*` — `code_generation.py`), and a research/RAG platform (`/research/query` — `ai_research_platform.py`, `RAG_system.py`). The `task_store` and per-task `TaskLogHandler` are in-memory only — restart loses task history (but not orchestrator metrics, which are pickled).

Models used (defined in `main.py`): `gemini-3.5-flash` (default), `gemini-3.1-pro-preview` (complex), `gemini-3.1-flash-lite` (lite), `gemini-embedding-001`. Image gen defaults to `imagen-4.0-fast-generate-001`. Music: `lyria-3.5` (`lyria.py`), the `lyria-3-*` models (`main.generate_music`) and `lyria-realtime-exp` (`music_realtime.py`).

Two API surfaces are in play. Most features use `generate_content`; the streaming assistant (`assistant_stream.py`), Maps grounding (`main.search_google_maps`) and Lyria 3.5 use the **Interactions API** (`client.interactions.create`), which needs `google-genai >= 2.0.0`.

`backend/agent_harness/` is a separate system from `MegaAgenticSystem`: `AgentHarness` → `Team` → `Agent`, with a shared `TaskRegistry` and per-agent `MentalModel`. `agent_harness/service.py` wraps it for the API as orch5 (`POST /orchestrators/multi-team`), planning teams from the goal and returning the files workers wrote.

Cross-module knowledge: `api_server.py` imports concrete functions from each feature module — when adding a new capability, expose a plain function in its module then wire a Pydantic request model + endpoint in `api_server.py`, following the existing pattern (handle `ServerError`/`ClientError`/`APIError` from `google.genai.errors` separately).

### Frontend

Next.js App Router under `frontend/app/`:
- `app/page.tsx` — main dashboard (Dashboard / Tasks / Metrics tabs).
- Feature routes: `app/code/`, `app/documents/`, `app/images/`, `app/research/`, `app/workflows/` — each is a single `page.tsx` that calls the corresponding `/code`, `/documents`, etc. backend endpoints via `lib/api.ts`.
- `lib/api.ts` is the single API client; all typed request/response shapes live there. Base URL comes from `NEXT_PUBLIC_API_URL`.
- `components/ui/` is shadcn/ui-style primitives; feature components (`task-form`, `task-list`, `task-detail`, `metrics-dashboard`, `workflow-*`) sit at `components/` root. Dark mode via `next-themes`.

CORS in `api_server.py` is currently `allow_origins=["*"]` (despite README claiming 3000-only) — keep this in mind when changing origins.

## Conventions

From `.cursorrules` (the project's authoritative frontend style guide):
- TypeScript everywhere; prefer `interface` over `type`; avoid enums (use const maps); use `satisfies`.
- Functional, declarative React; favor RSC, minimize `'use client'`; use Suspense and error boundaries.
- State: `useActionState` (not deprecated `useFormState`); `useFormStatus` with new `data`/`method`/`action`; use `nuqs` for URL state.
- Always `await` async runtime APIs: `cookies()`, `headers()`, `draftMode()`, `props.params`, `props.searchParams`.
- Naming: descriptive boolean prefixes (`isLoading`, `hasError`); event handlers prefixed `handle*`; directories lowercase-with-dashes; named exports for components.

`.editorconfig` enforces 4-space indent, CRLF, no trailing-whitespace trimming, no final newline — Windows-friendly defaults.

## Context7 docs lookup

The user has a global rule (`~/.claude/rules/context7.md`) to fetch library docs via `npx ctx7@latest` before answering library/framework questions. Follow it: `library <name> "<question>"` → pick `/org/project` ID → `docs <id> "<question>"`. Max 3 commands per question. Especially relevant here for `google-genai` (Python), `@google/genai` patterns, Next.js 16, React 19, Tailwind v4, shadcn/ui.
