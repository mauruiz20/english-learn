# English Learn API

Optional backend for English Learn: **Google sign-in** (web) and **progress sync**.
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
| Export OpenAPI schema | `uv run python -m english_learn_api.export_openapi openapi.json`        |
| Tests (needs Docker)  | `uv run pytest`                                                         |
| Unit tests only       | `uv run pytest -m "not integration"`                                    |
| Real Google cert test | `RUN_GOOGLE_NETWORK_TESTS=1 uv run pytest -m google_network`            |
| Lint / format         | `uv run ruff check .` · `uv run ruff format .`                          |
| Typecheck (strict)    | `uv run mypy`                                                           |
| Production image      | `docker build -t english-learn-api .`                                   |

Released migrations are never edited; every schema change is a new Alembic revision.

The typed TypeScript client is generated from this API's schema into
[`packages/api-client`](../../packages/api-client/README.md): after changing a route or a body,
run `pnpm api-client:generate` from the repository root (CI fails while it is stale).

## Endpoints

All errors share one shape: `{ "error": { "code": "...", "message": "..." } }`. Every 401 carries
`WWW-Authenticate: Bearer` (`Bearer error="invalid_token"` for a bad or expired access token).

| Method   | Path               | Body                                    | Success                                                                                        | Errors                                                                                                     |
| -------- | ------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `POST`   | `/v1/auth/google`  | `{ idToken }`                           | 200 `{ accessToken, accessTokenExpiresAt, refreshToken, user: { id, email } }`                 | 401 `invalid_google_token`, 403 `google_email_not_verified`, 503 `google_unavailable` / `google_busy`, 429 |
| `POST`   | `/v1/auth/refresh` | `{ refreshToken }`                      | 200 `{ accessToken, accessTokenExpiresAt, refreshToken }`                                      | 401 `invalid_refresh_token`, 401 `refresh_token_reused`, 429                                               |
| `POST`   | `/v1/auth/logout`  | `{ refreshToken }`                      | 204 (also for unknown tokens)                                                                  | 422, 429                                                                                                   |
| `GET`    | `/v1/me`           | Bearer                                  | 200 `{ id, email }`                                                                            | 401 `unauthorized`, `invalid_token`, `account_not_found`                                                   |
| `DELETE` | `/v1/account`      | Bearer                                  | 204: user, devices, events and tokens are deleted                                              | 401 `reauthentication_required`, `account_not_found`, 429                                                  |
| `GET`    | `/healthz`         |                                         | 200 `{ status: "ok" }` (pings the database)                                                    | 503 `database_unavailable`                                                                                 |
| `POST`   | `/v1/sync`         | Bearer + `{ deviceId, cursor, events }` | 200 `{ events, cursor, hasMore, accepted, duplicates, conflicts }` ([details](#progress-sync)) | 401, 409 `device_conflict`, 413, 422 `validation_error`, 429                                               |

Timestamps are ISO 8601 in UTC. Request bodies over `MAX_REQUEST_BODY_BYTES` (1 MiB) get 413.
Every protected route checks that the account still exists: a deleted user's access token is
answered with 401 `account_not_found` until it expires.

## Progress sync

`POST /v1/sync` uploads the device's events and downloads the account's events after `cursor`,
in one transaction. The server keeps an opaque log: it validates the envelope, checks payloads
for shape and size only, and never folds them.

```jsonc
// request
{
  "deviceId": "6f1c2a4e-0b1d-4c2e-9f3a-5b6c7d8e9f01",
  "cursor": null, // or the previous response's cursor
  "events": [
    {
      "id": "019a3456-7890-7abc-8def-0123456789ab",
      "occurredAt": 1793361600000,
      "localDate": "2026-10-30",
      "type": "item_reviewed",
      "payload": { "v": 1, "sessionId": "s1", "itemId": "i1", "grade": 3 },
    },
  ],
}
// response: events carry the deviceId that uploaded them first
{ "events": [], "cursor": 1234, "hasMore": false, "accepted": 1, "duplicates": 0, "conflicts": [] }
```

- **Device.** The first sync registers `deviceId` for the caller; every sync sets its
  `last_seen_at`. An id registered to another account answers 409 `device_conflict` and stores
  nothing: the client generates a new device id and syncs again.
- **Idempotent uploads.** Event ids are unique per user (`ON CONFLICT (user_id, id) DO NOTHING`).
  An id already stored with the same content (`occurredAt`, `localDate`, `type`, `payload`; the
  device may differ) counts in `duplicates`. With different content the first version is kept and
  the id is listed once in `conflicts`. Neither fails the batch, and repeats inside one batch
  follow the same rule against their first copy.
- **Download.** `events` are the account's events with `seq > cursor` (`null` counts as 0) in
  `seq` order, at most 500, including the ones just uploaded (clients dedupe by id). `cursor` is
  the `seq` of the last returned event, or the request's cursor when none is returned; while
  `hasMore` is true, sync again with it.
- **Ordering guarantee.** `seq` is taken from a sequence when a row is inserted, but the row
  becomes visible when its transaction commits. Two concurrent appends of one user could commit
  out of order, and a reader between the two commits would move its cursor past the lower `seq`
  for good. Every sync therefore locks the user row (`SELECT … FOR NO KEY UPDATE`) before touching
  devices or events: one user's appends run one at a time and commit in `seq` order, so a cursor
  never passes an event that is still to commit. Readers see only committed rows. Other users and
  foreign-key checks are not blocked. An account deletion and a sync wait for each other (user row
  first, as everywhere); a sync that waited for a deletion answers 401 `account_not_found`.
  `tests/integration/test_sync_races.py` forces these interleavings.

| Field / limit     | Rule                                                                               |
| ----------------- | ---------------------------------------------------------------------------------- |
| Events per upload | ≤ 500                                                                              |
| Events per page   | ≤ 500                                                                              |
| `id`              | UUIDv7 in canonical lowercase `8-4-4-4-12` form (clients dedupe by the exact text) |
| `deviceId`        | UUID (any version), canonical lowercase                                            |
| `occurredAt`      | Integer epoch ms in [2000-01-01, 2100-01-01): static, so a wrong clock still syncs |
| `localDate`       | A real `YYYY-MM-DD` date from 2000-01-01 to 2099-12-31                             |
| `type`            | snake_case, 1–40 characters; unknown types are stored too (forward compatible)     |
| `payload`         | JSON object, ≤ 8 KiB as compact UTF-8 JSON, no NaN/Infinity, no U+0000             |
| Request body      | ≤ `MAX_REQUEST_BODY_BYTES` (1 MiB), so a batch of large payloads must be split     |

Unknown or missing fields are refused with 422; `cursor` is required (`null` on a first sync).

## Tokens and sessions

| Token   | Format                                                                  | Lifetime                                   | Stored              |
| ------- | ----------------------------------------------------------------------- | ------------------------------------------ | ------------------- |
| Access  | JWT HS256, `kid` header; `sub`, `iat`, `exp`, `iss`, `aud`, `auth_time` | 15 min                                     | Nowhere (stateless) |
| Refresh | 32 random bytes, base64url, opaque                                      | 14 days idle, 60 days from sign-in at most | SHA-256 hash only   |

A **session** (refresh _family_) starts at each Google sign-in. Every refresh token rotated from
it belongs to the family, and the family row is what refresh, logout and reuse revocation lock
(`SELECT … FOR UPDATE`) before touching any token, so a revocation always sees every successor.

- **Lifetimes.** Each new refresh token expires at
  `min(now + REFRESH_TOKEN_TTL, family.created_at + SESSION_MAX_LIFETIME)`: an idle timeout of
  14 days that every refresh slides forward, and an absolute end 60 days after the sign-in that
  nothing extends. After that the user signs in with Google again.
- **Rotation.** Each refresh token works once: `/v1/auth/refresh` replaces it with a new one in
  the same family.
- **Reuse detection.** Presenting an already-rotated token means two parties hold a copy (likely
  theft). The whole family is revoked (`refresh_families.revoked_at`, plus every token) and the
  call answers 401 `refresh_token_reused`; that device signs in again.
- **Retry grace window.** A token rotated less than `REFRESH_RETRY_GRACE` (45 s) ago, measured
  from its rotation, whose successor has not been used yet, is treated as a retry rather than
  theft: the response was lost, or two refreshes raced. The unused successor is revoked
  (superseded), a new token is issued in the same family, and the call answers 200. Exactly one
  token stays live. Outside the window, once the successor has been used, or when a superseded
  token is presented later, the family is revoked as above.
- **Concurrent refreshes** of the same token both succeed (the second is a retry), but only the
  token issued last stays live; the client that keeps the other one will see its next refresh
  fail and revoke the family. Clients must therefore serialize refreshes (below).
- **Logout** revokes the family. **Account deletion** removes everything (FK `ON DELETE CASCADE`).
- **Account deletion needs a recent sign-in.** `DELETE /v1/account` requires an access token
  whose `auth_time` (the Google sign-in that started the session, kept across refreshes) is less
  than `REAUTHENTICATION_WINDOW` (5 min) old; otherwise 401 `reauthentication_required`, and the
  client signs in with Google again and retries. `iat` is not used for this because every refresh
  renews it, which would let a stolen refresh token delete the account.

### Client requirements

- **Serialize refreshes** across tabs with the Web Locks API, and re-read the stored token inside
  the lock (another tab may have refreshed already):

  ```ts
  await navigator.locks.request("refresh", async () => {
    const current = await storage.getRefreshToken();
    const tokens = await api.refresh(current);
    await storage.setRefreshToken(tokens.refreshToken); // persist before using it
    return tokens;
  });
  ```

- **Persist the new refresh token before using** the new access token. If the app dies after the
  server rotated but before the new token was saved, the next start presents the old one; within
  the grace window that is a retry, after it the session is revoked.
- On 401 `reauthentication_required`, run Google sign-in again and repeat the request.
- On 429, wait `Retry-After` seconds. On 503 `google_busy` or `google_unavailable`, retry later.

### Signing keys

`JWT_SECRET` (simple mode) signs with `kid: "default"`. For rotation set `JWT_KEYS` instead, a
JSON object `{ kid: secret }`, and `JWT_ACTIVE_KID`: new tokens are signed with the active key and
any listed key verifies. To rotate: add the new key, deploy, switch `JWT_ACTIVE_KID`, deploy, and
remove the old key once its tokens expired (15 min). Moving from simple mode, keep the old secret
under `"default"`. Every secret needs at least 32 bytes and 16 distinct byte values; the app
refuses to start otherwise.

### Why JSON and not cookies (open decision)

The web app (`*.pages.dev`) and the API (`*.onrender.com`) are on different sites. An `HttpOnly`
refresh cookie would be a third-party cookie, which Safari blocks (and Chrome is restricting), so
sign-in would break on iOS. Tokens are returned in JSON and sent as `Authorization: Bearer`. The
tradeoff: tokens are reachable by JavaScript, so XSS on the web app could steal them; short access
tokens, rotation, reuse detection, the session lifetimes and recent-auth for deletion limit the
damage.

**Pending owner decision:** serving the web app and the API from one registrable domain (for
example `app.example.com` and `api.example.com`) would make the refresh cookie first-party, so it
could be `HttpOnly; Secure; SameSite=Lax` and out of JavaScript's reach. That needs a custom
domain for both; cookies are not implemented until it is decided.

## Abuse protection

| Endpoint                | Limit       | Key       |
| ----------------------- | ----------- | --------- |
| `POST /v1/auth/google`  | 10 / minute | client IP |
| `POST /v1/auth/refresh` | 30 / minute | client IP |
| `POST /v1/auth/logout`  | 30 / minute | client IP |
| `DELETE /v1/account`    | 5 / hour    | user      |
| `POST /v1/sync`         | 60 / minute | user      |

Token buckets: the whole limit is available as a burst and refills continuously. Over the limit
the API answers 429 `rate_limited` with `Retry-After`. Limits live in code (`RateLimits` in
`main.py`).

- **Single instance.** Buckets are kept in this process's memory (bounded to 10 000 keys per
  endpoint). With several instances each one keeps its own buckets, so the effective limit
  multiplies; running more than one instance needs a shared store (for example Redis).
- **Client IP** is `request.client`, which uvicorn rewrites from `X-Forwarded-For` only when the
  connecting peer is listed in `FORWARDED_ALLOW_IPS`, taking the rightmost address that is not a
  trusted proxy. The limiter and the server therefore agree on the client's address; a client
  cannot pick its own by sending the header.
- **Google verification** runs at most 8 at a time (each one holds a worker thread). A sign-in
  waits up to 2 s for a slot, then gets 503 `google_busy`. A whole verification is bounded to 8 s.

## Architecture

Screaming + hexagonal: top-level packages are features, each split into domain, application
(use cases and ports) and infrastructure (adapters), with a thin API layer.

```
src/english_learn_api/
  main.py            composition root: create_app(settings) wires adapters into use cases
  settings.py        pydantic-settings (env / .env)
  export_openapi.py  writes the OpenAPI schema without a database (for client generation)
  auth/              domain (User, RefreshFamily, RefreshToken, errors) · application (ports, use cases)
                     infrastructure (google-auth verifier, JWT, SQLAlchemy repos, unit of work) · api
  account/           GET /v1/me, DELETE /v1/account
  health/            GET /healthz
  sync/              domain (envelope, limits) · application (ports, SyncProgress)
                     infrastructure (devices, event log, unit of work, tables) · api (POST /v1/sync)
  shared/            clock, database, error model, middlewares, rate limiter, JSON logging
migrations/          Alembic (async engine)
```

| Port                  | Production adapter                                          | Test double              |
| --------------------- | ----------------------------------------------------------- | ------------------------ |
| `GoogleTokenVerifier` | google-auth `verify_oauth2_token`, behind a concurrency cap | `FakeGoogleVerifier`     |
| `AccessTokens`        | `JwtAccessTokens` (PyJWT)                                   | `FakeAccessTokens`       |
| `UnitOfWork` + repos  | SQLAlchemy Core on PostgreSQL                               | in-memory, with rollback |
| `SyncUnitOfWork`      | `SqlAlchemySyncUnitOfWork` (devices, event log)             | `FakeSyncUnitOfWork`     |
| `Clock`               | `SystemClock`                                               | `FakeClock`              |

- **Google verification** rejects anything that is not three base64url segments, then checks the
  signature against Google's certificates, `exp`, the audience (one of `GOOGLE_CLIENT_IDS`), `azp`
  when present (also one of them), the issuer (`accounts.google.com`) and requires
  `email_verified`. Malformed tokens are a 401, never a 500. The certificates are cached for their
  `max-age`; the download happens outside the cache lock (one fetch per URL at a time, the others
  wait for it), the last good certificates are served for up to a day if a refetch fails, and a
  failure with nothing cached is remembered for 10 s. google-auth is synchronous, so it runs in a
  worker thread.
- **Lock order** for refresh and logout: user (`FOR KEY SHARE`), family (`FOR UPDATE`), token. An
  account deletion locks the user first too, so the two wait for each other instead of
  deadlocking; a refresh racing with a deletion ends in 401, never 500.
- **Async all the way** (asyncpg, async SQLAlchemy): I/O-bound endpoints, one process on a small
  instance.
- **Events are opaque.** `events` keeps the envelope columns needed to page and filter (`seq`
  BIGSERIAL, `id` UUIDv7, `type`, `local_date`, `occurred_at`) and the payload as `jsonb`. Event
  ids are unique per user, and `(device_id, user_id)` references `devices (id, user_id)`, so an
  event can only point at a device of its own user (deleting the device or the user cascades).
- **No secrets in logs.** Log lines identify users by id only; the engine runs with
  `hide_parameters=True`, so a failing statement never logs its bound values (emails, hashes).

## Configuration

| Variable                  | Default                                                     | Notes                                                                 |
| ------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `ENV`                     | `development`                                               | `development` · `test` · `production` (see below)                     |
| `DATABASE_URL`            | required                                                    | `postgres://` URLs are converted to asyncpg                           |
| `GOOGLE_CLIENT_IDS`       | the web client id                                           | Comma-separated; checked against `aud` and `azp`. Public values       |
| `JWT_SECRET`              | required unless `JWT_KEYS`                                  | Secret, ≥ 32 bytes and ≥ 16 distinct bytes, only via the environment  |
| `JWT_KEYS`                | unset                                                       | JSON `{ kid: secret }` for key rotation, instead of `JWT_SECRET`      |
| `JWT_ACTIVE_KID`          | unset                                                       | Required with `JWT_KEYS`: the key that signs                          |
| `ACCESS_TOKEN_TTL`        | `900`                                                       | Durations: seconds or ISO 8601 (`PT15M`)                              |
| `REFRESH_TOKEN_TTL`       | `P14D`                                                      | Idle timeout, slid by every refresh                                   |
| `SESSION_MAX_LIFETIME`    | `P60D`                                                      | Absolute, from the sign-in                                            |
| `REFRESH_RETRY_GRACE`     | `45`                                                        | Retry window after a rotation; `0` disables it                        |
| `REAUTHENTICATION_WINDOW` | `300`                                                       | Max age of the sign-in for `DELETE /v1/account`                       |
| `CORS_ORIGINS`            | `https://english-learn-iwl.pages.dev,http://localhost:8081` | Comma-separated. Required (https, no localhost, no `*`) in production |
| `MAX_REQUEST_BODY_BYTES`  | `1048576`                                                   |                                                                       |
| `LOG_LEVEL`               | `INFO`                                                      | JSON lines; no tokens or emails are logged                            |
| `FORWARDED_ALLOW_IPS`     | `127.0.0.1` (image)                                         | Read by uvicorn: proxies whose `X-Forwarded-*` headers are trusted    |

**`ENV=production`** refuses to start without an explicit `CORS_ORIGINS`, accepts only public
`https` origins there, and does not serve `/docs`, `/redoc` or `/openapi.json` (use
`python -m english_learn_api.export_openapi` to get the schema). `development` and `test` keep the
localhost CORS default and the interactive docs.

**CORS and cross-origin isolation.** The web app is served with `COOP: same-origin` and
`COEP: require-corp` (expo-sqlite needs `SharedArrayBuffer`). COEP governs _embedded resources_;
a `fetch` to another origin in CORS mode is allowed as long as the API answers with
`Access-Control-Allow-Origin` for that origin, which `CORS_ORIGINS` controls. No credentials mode
is needed because tokens travel in the `Authorization` header.

## Testing

- **Unit** (`tests/unit`): use cases with in-memory fakes, JWTs, settings, the HTTP shell, the rate
  limiter, and the google-auth adapter offline (our own RSA key and a controllable certificate
  endpoint: single flight, stale serving, negative cache, timeouts).
- **Integration** (`tests/integration`): PostgreSQL 18 through testcontainers, migrated with
  Alembic: migrations (up, down, drift against the SQLAlchemy tables, backfill, cascades),
  repositories, sync-table integrity, every endpoint through `httpx.AsyncClient`, rate limits,
  concurrent syncs (an append waits for the user's in-flight one; a cursor follower never skips),
  and refresh races with forced interleavings (a transaction pauses with its locks held while the
  test waits for the competitor to block on a lock): reuse revocation against a concurrent
  rotation, and refresh against account deletion. Set `TEST_DATABASE_URL` to use an existing
  disposable database instead of a container.
- CI runs the same suite on GitHub's Ubuntu runners, whose Docker daemon testcontainers uses
  directly (no `services:` container to keep in sync).

## Deploying (Render, later)

Build from `services/api/Dockerfile` (slim, non-root, listens on `$PORT`, base images pinned by
digest; the file says how to bump them). Run `alembic upgrade head` as the pre-deploy command and
point the health check at `/healthz`. Set `ENV=production`, `CORS_ORIGINS`, `JWT_SECRET` (or
`JWT_KEYS` + `JWT_ACTIVE_KID`) and `DATABASE_URL`.

**Forwarded headers.** Render terminates TLS at its proxy, which connects to the container from
its private network and appends the real client to `X-Forwarded-For`. With the image default
(`FORWARDED_ALLOW_IPS=127.0.0.1`) the proxy is not trusted, so every request appears to come from
the proxy and all clients share one rate-limit bucket. Set `FORWARDED_ALLOW_IPS` to the address
range the proxy connects from (check the peer address the service actually sees before relying on
it; a private range such as `10.0.0.0/8` is typical), never `*`: with `*` any client could send
its own `X-Forwarded-For` and choose the address the rate limiter sees. uvicorn then uses the
rightmost address that is not a trusted proxy, the one Render appended.
