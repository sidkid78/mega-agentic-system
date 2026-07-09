# Deploying (Render + Vercel, bring-your-own-key)

The app is **BYOK**: the servers hold no Gemini key. Every visitor enters their
own key in the UI (bottom-right button), and it rides along with each request.
So there are **no API-key secrets to configure** when deploying.

- **Backend** (FastAPI, Docker) → **Render**
- **Frontend** (Next.js) → **Vercel**

Prerequisite: push this repo to GitHub (both `backend/` and `frontend/` live in
the one repo).

---

## 1. Backend → Render

The repo already contains `render.yaml` (a Blueprint) and `backend/Dockerfile`.

1. Go to [Render](https://render.com) → **New +** → **Blueprint**.
2. Connect your GitHub repo. Render reads `render.yaml` and proposes a web
   service named `mega-agentic-backend` (Docker, free plan).
3. Click **Apply**. First build takes a few minutes.
4. When live you'll get a URL like `https://mega-agentic-backend.onrender.com`.
   Verify it: open `https://…onrender.com/health` → should return JSON with
   `"status"` and `"system_initialized": true`.

Notes:
- **No env vars needed** (BYOK). The service boots with no key.
- **WebSockets** (Gemini Live, live music) work on Render out of the box.
- **Free plan** spins down after ~15 min idle; the next request cold-starts in
  ~50s (you'll see the first load hang, then work). Upgrade to **Starter** to
  keep it always-on.
- The orchestrator's `mega_system_state.pkl` lives on ephemeral disk and resets
  on redeploy — fine for this use.

## 2. Frontend → Vercel

1. Go to [Vercel](https://vercel.com) → **Add New** → **Project** → import the
   same GitHub repo.
2. **Root Directory**: set to **`frontend`** (important — the Next.js app is not
   at the repo root).
3. Framework preset auto-detects **Next.js**. Leave build/output defaults.
4. **Environment Variables** → add:
   - `NEXT_PUBLIC_API_URL` = your Render backend URL, e.g.
     `https://mega-agentic-backend.onrender.com` (no trailing slash).
5. **Deploy**. You'll get a URL like `https://your-app.vercel.app`.

That's the link you share with friends.

### Why this works end-to-end
- Browser → Vercel serves the UI.
- UI calls the backend at `NEXT_PUBLIC_API_URL` (Render), sending the user's key
  as `X-Gemini-Key`.
- Live/music **WebSockets** connect the browser straight to Render
  (`wss://…onrender.com/…?key=…`) — Vercel isn't in that path.
- The Next.js **API routes** (`/api/videos/*`, `/api/images/nano-banana`) run on
  Vercel and read the key from the request (no server key).

---

## Gotchas

- **Update `NEXT_PUBLIC_API_URL` and redeploy** the frontend if the backend URL
  changes — it's inlined at build time, not read at runtime.
- **Gemini Live needs HTTPS** for microphone access. Vercel gives you HTTPS, so
  it works in production. (Locally, use `http://localhost:3000`, not a LAN IP.)
- **Vercel Hobby** caps serverless functions at 60s. The video routes use a
  quick-start-then-poll flow, so this is usually fine; very large Omni video
  uploads could hit the limit (upgrade to Pro for 300s if needed).
- **Preview models**: Gemini Live (`gemini-3.1-flash-live-preview`) and some
  video/image models require preview access on the visitor's own key.
- **CORS** is already `*` on the backend, so the Vercel origin is allowed.

## Alternative backend hosts
`render.yaml` is Render-specific, but `backend/Dockerfile` is portable — the same
image runs on Railway, Fly.io, or any Docker host. Just point the platform at
`backend/Dockerfile` and set `NEXT_PUBLIC_API_URL` to whatever URL you get.
