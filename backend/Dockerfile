# Mega Agentic System — FastAPI backend
# Uses uv for fast, reproducible installs from uv.lock.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

# Keep the venv inside the project and don't try to build the app itself as a package.
ENV UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

# Install dependencies first (cached unless pyproject.toml / uv.lock change).
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Copy the application source.
COPY . .

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8010

# api_server.py exposes `app`; bind to all interfaces. Honour $PORT when the host
# injects one (e.g. Render), otherwise default to 8010 for local docker compose.
# Shell form so ${PORT} is expanded at runtime.
CMD uvicorn api_server:app --host 0.0.0.0 --port ${PORT:-8010}
