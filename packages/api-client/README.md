# @english-learn/api-client

Typed client for the [English Learn API](../../services/api/README.md). Types are generated from
the API's OpenAPI schema; the client is a thin wrapper over `fetch` with no runtime dependencies.

```ts
import { ApiError, createApiClient } from "@english-learn/api-client";

const api = createApiClient({
  baseUrl: "https://english-learn-api.onrender.com",
  getAccessToken: () => session.accessToken, // null when signed out
  // fetch: optional, defaults to the global fetch
});

const page = await api.sync({ deviceId, cursor, events });
```

| Method                      | Request                       | Returns                                                        |
| --------------------------- | ----------------------------- | -------------------------------------------------------------- |
| `signInWithGoogle(idToken)` | `POST /v1/auth/google`        | `{ accessToken, accessTokenExpiresAt, refreshToken, user }`    |
| `refresh(refreshToken)`     | `POST /v1/auth/refresh`       | `{ accessToken, accessTokenExpiresAt, refreshToken }`          |
| `logout(refreshToken)`      | `POST /v1/auth/logout`        | `void`                                                         |
| `me()`                      | `GET /v1/me` (Bearer)         | `{ id, email }`                                                |
| `deleteAccount()`           | `DELETE /v1/account` (Bearer) | `void`                                                         |
| `sync(request)`             | `POST /v1/sync` (Bearer)      | `{ events, cursor, hasMore, accepted, duplicates, conflicts }` |

A non-2xx answer throws `ApiError` with `status`, the API's `code` (`device_conflict`,
`rate_limited`, `reauthentication_required`…; `http_<status>` when the body is not the API's error
shape), `message` and `retryAfterSeconds` (from `Retry-After`). Network failures are rethrown as
`fetch` raised them. The client does not refresh tokens or retry by itself.

## Generated files

`openapi.json` (the exported schema) and `src/generated/schema.ts` (its types, from
`openapi-typescript`, pinned) are committed. After changing the API:

```sh
pnpm api-client:generate   # exports the schema with uv and regenerates both files
pnpm api-client:check      # fails when either file is stale (part of `pnpm check`)
```

Both need [uv](https://docs.astral.sh/uv/) (it installs the API's Python). In CI the check runs in
its own `api-client` job, which sets up uv, Python and Node; the main `check` job keeps running
this package's typecheck and tests without Python.
