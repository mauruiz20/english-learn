# English Learn API

Optional backend for English Learn: **Google sign-in** (web) and, from stage 5, **progress sync**.
The app stays offline-first; the API only stores and returns the client's progress events. It
never folds them: the fold lives in [`packages/domain`](../../packages/domain/README.md#progress-event-log).

FastAPI · SQLAlchemy 2 (async, asyncpg) · PostgreSQL 18 · Alembic · Python 3.14 · uv.

## Quick path

```sh
cd services/api
cp .env.example .env               # then set JWT_SECRET (see the file)
docker compose up -d --wait        # PostgreSQL 18 on 127.0.0.1:5433 (POSTGRES_PORT to change)
uv sync
uv run alembic upgrade head
uv run uvicorn english_learn_api.main:app_from_env --factory --reload   # http://127.0.0.1:8000/docs
```

| Task                  | Command                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| Dev server            | `uv run uvicorn english_learn_api.main:app_from_env --factory --reload` |
| Migrate               | `uv run alembic upgrade head` (`downgrade base` to undo)                |
| New migration         | `uv run alembic revision --autogenerate -m "..."`                       |
| Tests (needs Docker)  | `uv run pytest`                                                         |
| Unit tests only       | `uv run pytest -m "not integration"`                                    |
| Real Google cert test | `RUN_GOOGLE_NETWORK_TESTS=1 uv run pytest -m google_network`            |
| Lint / format         | `uv run ruff check .` · `uv run ruff format .`                          |
| Typecheck (strict)    | `uv run mypy`                                                           |
| Production image      | `docker build -t english-learn-api .`                                   |

## Endpoints

All errors share one shape: `{ "error": { "code": "...", "message": "..." } }`. Every 401 carries
`WWW-Authenticate: Bearer` (`Bearer error="invalid_token"` for a bad or expired access token).

| Method   | Path               | Body               | Success                                                                        | Errors                                                                                |
| -------- | ------------------ | ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `POST`   | `/v1/auth/google`  | `{ idToken }`      | 200 `{ accessToken, accessTokenExpiresAt, refreshToken, user: { id, email } }` | 401 `invalid_google_token`, 403 `google_email_not_verified`, 503 `google_unavailable` |
| `POST`   | `/v1/auth/refresh` | `{ refreshToken }` | 200 `{ accessToken, accessTokenExpiresAt, refreshToken }`                      | 401 `invalid_refresh_token`, 401 `refresh_token_reused`                               |
| `POST`   | `/v1/auth/logout`  | `{ refreshToken }` | 204 (also for unknown tokens)                                                  | 422                                                                                   |
| `GET`    | `/v1/me`           | Bearer             | 200 `{ id, email }`                                                            | 401 `unauthorized`, `invalid_token`, `account_not_found`                              |
| `DELETE` | `/v1/account`      | Bearer             | 204: user, devices, events and tokens are deleted                              | 401                                                                                   |
| `GET`    | `/healthz`         |                    | 200 `{ status: "ok" }` (pings the database)                                    | 503 `database_unavailable`                                                            |

Timestamps are ISO 8601 in UTC. Request bodies over `MAX_REQUEST_BODY_BYTES` (1 MiB) get 413.

## Tokens

| Token   | Format                                                 | Lifetime | Stored              |
| ------- | ------------------------------------------------------ | -------- | ------------------- |
| Access  | JWT HS256; `sub` (user id), `iat`, `exp`, `iss`, `aud` | 15 min   | Nowhere (stateless) |
| Refresh | 32 random bytes, base64url, opaque                     | 30 days  | SHA-256 hash only   |

- **Rotation.** Each refresh token works once: `/v1/auth/refresh` revokes it and issues a new one
  in the same _family_ (one family per sign-in).
- **Reuse detection.** Presenting an already-rotated token means two parties hold a copy (likely
  theft). The whole family is revoked and the call answers 401 `refresh_token_reused`; that device
  signs in again. The row is locked (`SELECT … FOR UPDATE`), so two concurrent refreshes cannot
  both rotate it: the second one counts as reuse. Clients must therefore serialize refreshes.
- **Logout** revokes the family. **Account deletion** removes everything (FK `ON DELETE CASCADE`).
- `JWT_SECRET` must have at least 32 bytes; the app refuses to start otherwise.

**Why JSON and not cookies.** The web app (`*.pages.dev`) and the API (`*.onrender.com`) are on
different sites. An `HttpOnly` refresh cookie would be a third-party cookie, which Safari blocks
(and Chrome is restricting), so sign-in would break on iOS. Tokens are returned in JSON and sent
as `Authorization: Bearer`. The tradeoff: tokens are reachable by JavaScript, so XSS on the web app
could steal them; short access tokens, rotation and reuse detection limit the damage. Hosting both
under one site (custom domain, `api.` subdomain) would allow `SameSite` cookies later.

## Architecture

Screaming + hexagonal: top-level packages are features, each split into domain, application
(use cases and ports) and infrastructure (adapters), with a thin API layer.

```
src/english_learn_api/
  main.py          composition root: create_app(settings) wires adapters into use cases
  settings.py      pydantic-settings (env / .env)
  auth/            domain (User, RefreshToken, errors) · application (ports, use cases)
                   infrastructure (google-auth verifier, JWT, SQLAlchemy repos, unit of work) · api
  account/         GET /v1/me, DELETE /v1/account
  health/          GET /healthz
  sync/            tables for devices and the opaque event store (endpoints in stage 5)
  shared/          clock, database, error model, middlewares, JSON logging
migrations/        Alembic (async engine)
```

| Port                  | Production adapter                | Test double              |
| --------------------- | --------------------------------- | ------------------------ |
| `GoogleTokenVerifier` | google-auth `verify_oauth2_token` | `FakeGoogleVerifier`     |
| `AccessTokens`        | `JwtAccessTokens` (PyJWT)         | `FakeAccessTokens`       |
| `UnitOfWork` + repos  | SQLAlchemy Core on PostgreSQL     | in-memory, with rollback |
| `Clock`               | `SystemClock`                     | `FakeClock`              |

- **Google verification** checks the signature against Google's certificates, `exp`, the audience
  (`GOOGLE_CLIENT_ID`), the issuer (`accounts.google.com`) and requires `email_verified`. The
  certificate download is cached for its `max-age`. google-auth is synchronous, so it runs in a
  worker thread.
- **Async all the way** (asyncpg, async SQLAlchemy): I/O-bound endpoints, one process on a small
  instance.
- **Events are opaque.** `events` keeps the envelope columns needed to page and filter (`seq`
  BIGSERIAL, `id` UUIDv7, `type`, `local_date`, `occurred_at`) and the payload as `jsonb`.

## Configuration

| Variable                 | Default                                                     | Notes                                        |
| ------------------------ | ----------------------------------------------------------- | -------------------------------------------- |
| `DATABASE_URL`           | required                                                    | `postgres://` URLs are converted to asyncpg  |
| `GOOGLE_CLIENT_ID`       | required                                                    | Public; the value is in `.env.example`       |
| `JWT_SECRET`             | required                                                    | Secret, ≥ 32 bytes, only via the environment |
| `ACCESS_TOKEN_TTL`       | `900`                                                       | Seconds or ISO 8601 (`PT15M`)                |
| `REFRESH_TOKEN_TTL`      | `P30D`                                                      |                                              |
| `CORS_ORIGINS`           | `https://english-learn-iwl.pages.dev,http://localhost:8081` | Comma-separated                              |
| `MAX_REQUEST_BODY_BYTES` | `1048576`                                                   |                                              |
| `LOG_LEVEL`              | `INFO`                                                      | JSON lines; no tokens or emails are logged   |

**CORS and cross-origin isolation.** The web app is served with `COOP: same-origin` and
`COEP: require-corp` (expo-sqlite needs `SharedArrayBuffer`). COEP governs _embedded resources_;
a `fetch` to another origin in CORS mode is allowed as long as the API answers with
`Access-Control-Allow-Origin` for that origin, which `CORS_ORIGINS` controls. No credentials mode
is needed because tokens travel in the `Authorization` header.

## Testing

- **Unit** (`tests/unit`): use cases with in-memory fakes, JWTs, settings, the HTTP shell, and the
  google-auth adapter offline (our own RSA key and certificate endpoint).
- **Integration** (`tests/integration`): PostgreSQL 18 through testcontainers, migrated with
  Alembic: migrations (up, down, drift against the SQLAlchemy tables, cascades), repositories
  (upsert races, row locking) and every endpoint through `httpx.AsyncClient`. Set
  `TEST_DATABASE_URL` to use an existing disposable database instead of a container.
- CI runs the same suite on GitHub's Ubuntu runners, whose Docker daemon testcontainers uses
  directly (no `services:` container to keep in sync).

## Deploying (Render, later)

Build from `services/api/Dockerfile` (slim, non-root, listens on `$PORT`). Run
`alembic upgrade head` as the pre-deploy command and point the health check at `/healthz`.
