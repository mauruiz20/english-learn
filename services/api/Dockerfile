# syntax=docker/dockerfile:1
# Production image: dependencies from uv.lock only, non-root, no build tools at runtime.
#
# Base images are pinned by digest (multi-arch index), so a rebuild uses the exact same bytes.
# To bump: `docker buildx imagetools inspect python:3.14-slim` (and the uv tag), copy the
# top-level "Digest:", update both FROM lines below, rebuild and run the test suite.
ARG PYTHON_IMAGE=python:3.14-slim@sha256:cd89c30eda26ee911a4611b18680086e0ea42e6f5f8cbe653d07fa7958c9cec8
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.10.7@sha256:edd1fd89f3e5b005814cc8f777610445d7b7e3ed05361f9ddfae67bebfe8456a

FROM ${UV_IMAGE} AS uv

FROM ${PYTHON_IMAGE} AS build
COPY --from=uv /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0 \
    UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /src

# Dependencies first: this layer is reused until uv.lock changes.
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-dev --no-install-project

COPY pyproject.toml uv.lock README.md ./
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-editable


FROM ${PYTHON_IMAGE}
RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY --from=build --chown=app:app /app/.venv /app/.venv
COPY --chown=app:app alembic.ini ./
COPY --chown=app:app migrations ./migrations
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    FORWARDED_ALLOW_IPS=127.0.0.1
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/healthz', timeout=4)"]
# Render (and most PaaS) inject PORT and terminate TLS in front of the container.
# X-Forwarded-For/-Proto are honored only from peers in FORWARDED_ALLOW_IPS (uvicorn reads the
# variable itself): IPs or CIDRs of the platform's proxy, never "*", or any client could pick
# its own address and dodge the per-IP rate limits. uvicorn then takes the rightmost address
# that is not a trusted proxy. See README "Deploying" for Render.
CMD ["sh", "-c", "exec uvicorn english_learn_api.main:app_from_env --factory --host 0.0.0.0 --port \"$PORT\" --proxy-headers --no-access-log"]
