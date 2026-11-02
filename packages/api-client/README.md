# @english-learn/api-client

Typed client for the [English Learn API](../../services/api/README.md). Types are generated from
the API's OpenAPI schema; the client is a thin wrapper over `fetch` with no runtime dependencies.

```ts
import { ApiError, createApiClient } from "@english-learn/api-client";

const api = createApiClient({
  baseUrl: "https://english-api.maumar.com.ar",
  getAccessToken: () => session.accessToken, // in memory only; null when signed out
  // tokenTransport: "cookie" (default, web) | "body"
  // fetch: optional, defaults to the global fetch
});

await api.signInWithGoogle(idToken, nonce); // sets the HttpOnly refresh cookie
const { accessToken } = await api.refresh(); // the browser sends the cookie
const page = await api.sync({ deviceId, cursor, events });
```

### Token transport

`tokenTransport` picks how the refresh token travels ([API docs](../../services/api/README.md#token-transport)):

- **`"cookie"` (default, the web app).** The API keeps the refresh token in an HttpOnly cookie that
  JavaScript cannot read. The auth calls send `credentials: "include"`, `X-Token-Transport: cookie`
  and `X-Requested-With: english-learn`; `signInWithGoogle` needs the OpenID Connect `nonce` of the
  Google authorization request (the API requires it here and checks it against the ID token),
  `refresh()` and `logout()` take no argument, and the responses have no `refreshToken`. Keep the access token in memory only.
- **`"body"` (clients that store the token, such as a future native app).** The auth calls send
  `X-Token-Transport: body`; `refresh(refreshToken)` and `logout(refreshToken)` send it in the body
  and the responses include `refreshToken`.

The types follow the option: `createApiClient({ ..., tokenTransport: "body" })` returns
`ApiClient<"body">`, otherwise `ApiClient<"cookie">`. Other routes never send credentials; the
transfer routes send no bearer token either.

| Method                                | Request                       | Returns (cookie · body)                                                  |
| ------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `signInWithGoogle(idToken, nonce)`    | `POST /v1/auth/google`        | `{ accessToken, accessTokenExpiresAt, user }` · same with `refreshToken` |
| `refresh()` · `refresh(refreshToken)` | `POST /v1/auth/refresh`       | `{ accessToken, accessTokenExpiresAt }` · same with `refreshToken`       |
| `logout()` · `logout(refreshToken)`   | `POST /v1/auth/logout`        | `void`                                                                   |
| `me()`                                | `GET /v1/me` (Bearer)         | `{ id, email }`                                                          |
| `deleteAccount()`                     | `DELETE /v1/account` (Bearer) | `void`                                                                   |
| `sync(request)`                       | `POST /v1/sync` (Bearer)      | `{ events, cursor, hasMore, accepted, duplicates, conflicts }`           |
| `createTransfer({ events })`          | `POST /v1/transfers`          | `{ token, expiresAt }` (anonymous, no credentials)                       |
| `claimTransfer(token)`                | `POST /v1/transfers/claim`    | `{ events }`, once; else 404 `transfer_not_found` (anonymous)            |

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
