# BYOK + Cloud Hosting Plan

Goal: friends use the app with **their own** Gemini API key (bring-your-own-key), hosted in the
cloud, so the owner's key/quota is never used. Server holds **zero** key.

Key travels as an `X-Gemini-Key` header (backend) / request field (Next.js API routes), stored in
each user's browser `localStorage`. HTTPS mandatory. Never log the key.

## Phase 1a — Backend BYOK core (`backend/`) ✅ DONE + smoke-tested
- [x] Add per-request key dependency in `api_server.py` (`get_gemini_key` / `get_gemini_client`, `X-Gemini-Key`, 401 if missing)
- [x] Swap `ai_client` → per-request client in `/images/*`, `/code/*`, `/documents/*`, `/csv/*` (17 endpoints + csv)
- [x] Orchestrator `/tasks`: build fresh `MegaAgenticSystem(api_key=key)` per task; key threaded through BackgroundTasks; run history folded into singleton for `/metrics`
- [x] Remove startup requirement for `GEMINI_API_KEY` (mega_system boots keyless; research/scout wrapped); fixed import-time client in `csv_data_completion_tool.py`

## Phase 1b — Backend research BYOK (`backend/`) — deferred
- [ ] Thread key into `AIResearchPlatform` (RAG + orchestrator + assistant) per request; `/research/*` currently returns unavailable under BYOK
- [ ] Audit for accidental key logging

## Phase 2 — Frontend BYOK (`frontend/`) ✅ DONE (typechecks clean)
- [x] `lib/api-key.ts` — localStorage key store + `apiKeyHeader()` helper + `gemini-key-changed` event
- [x] `components/api-key-settings.tsx` — floating key button (red pulse when unset) + modal: paste/show/save/remove, "Get a free key" link, mounted globally in `app/layout.tsx`
- [x] `lib/api.ts`: attaches `X-Gemini-Key` in central `request()` (covers all backend endpoints)
- [x] `lib/server-gemini.ts` + all 5 Next.js API routes read key from request header, build client per-call, 401 if missing (videos generate/poll, omni generate/poll, images nano-banana)
- [x] Fetch sites send the header (videos page ×4, images nano-banana ×1)

## Phase 1b — Gap-filling ✅ DONE + smoke-tested (all gate on key, boot keyless)
- [x] Speech `/speech/generate` + `/speech/generate-multi` → inject per-request client
- [x] Music `/music/generate` (client param added) + `/music/realtime/ws` (key via `?key=` query param)
- [x] Research `/research/query` built per-request from key; `/research/grounded` injects client
- [x] Frontend music WS + new Live WS send key as query param (`lib/api.ts` helpers)

## Gemini Live (new feature) ✅ DONE
- [x] Backend WS `/speech/live/ws` — bridges browser mic ↔ Gemini Live (`gemini-3.1-flash-live-preview`), BYOK via `?key=`, audio in 16 kHz / out 24 kHz, input+output transcription, interruption; `/speech/live/metadata` public
- [x] Frontend `components/gemini-live.tsx` — mic capture → 16 kHz PCM → WS, 24 kHz playback queue w/ interruption, voice + persona config, live transcript; added as "Live" tab on `/speech`
- ⚠️ getUserMedia needs a **secure context**: works on `localhost` and HTTPS (Vercel), NOT over a bare `http://192.168.x` LAN IP. Requires preview-model access on the user's key.

## Still not BYOK (lower priority)
- Deeper RAG endpoints + standalone orchestrator/assistant endpoints (use the keyless startup singleton)
- Scout/Plan/Build `/scout-plan-build`

## Phase 3 — Hosting ✅ SETUP DONE (prod build passes)
- [x] `render.yaml` blueprint (backend Docker, free plan, `/health` check, no env key)
- [x] Backend Dockerfile binds `$PORT` (Render) with 8010 fallback (compose)
- [x] `docker-compose.yml` + `.env.example`: `GEMINI_API_KEY` now optional (BYOK)
- [x] `DEPLOY.md` — step-by-step Render + Vercel guide
- [x] Verified: `npm run build` passes (21 routes incl. Live); backend boots keyless
- [ ] **User action:** push to GitHub → Render Blueprint → Vercel (root=`frontend`, set `NEXT_PUBLIC_API_URL`)

## Decisions (locked)
- Host: **Render** for backend, **Vercel** for frontend
- Pure BYOK, no server fallback key
- Order: Phase 1 → 2 locally, then Phase 3 deploy
