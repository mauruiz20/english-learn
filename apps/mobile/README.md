# @english-learn/mobile

Expo (SDK 58) app shell: expo-router screens, SQLite persistence via `expo-sqlite`, and a static
web build. Offline-first: no network or AI at runtime. UI copy is Spanish.

## Structure

| Path                  | Responsibility                                                       |
| --------------------- | -------------------------------------------------------------------- |
| `src/app/`            | Routes only (`/`, `/placement`, `/lesson/[id]`, `/review`, `/about`) |
| `src/features/*`      | Feature screens; containers load data, views are pure (props only)   |
| `src/infrastructure/` | Adapters: `SystemClock`, SQLite wiring, `AppServicesProvider` (DI)   |
| `src/shared/ui/`      | Small UI primitives and theme tokens                                 |
| `e2e/`                | Playwright smoke tests against the exported web build                |

Features read `ProgressRepository` and `Clock` from `useAppServices()`. The root layout provides
the SQLite-backed implementations (`@english-learn/storage-sqlite`, migrated in `onInit`); tests
wrap components in `<AppServicesProvider services={...}>` with in-memory fakes.

## Commands

Run from this folder, or from the repo root with `pnpm --filter @english-learn/mobile <script>`.

```sh
pnpm start          # Expo dev server (press w for web, i/a for simulators)
pnpm web            # dev server, web only
pnpm lint           # ESLint (eslint-config-expo); also run by `pnpm lint` at the root
pnpm typecheck      # tsc --noEmit
pnpm test           # Jest (jest-expo + React Native Testing Library)

pnpm export:web     # static SPA export to dist/
pnpm serve:web      # serve dist/ on http://localhost:4173 with the required headers
pnpm e2e:web        # Playwright smoke test (serves dist/ itself; run export:web first)
```

First-time Playwright setup: `pnpm exec playwright install chromium`.

## Hosting the web build

`expo-sqlite` on web runs SQLite as WebAssembly and needs `SharedArrayBuffer`, which browsers only
enable on cross-origin isolated pages. Every response must carry:

```
Cross-Origin-Embedder-Policy: credentialless
Cross-Origin-Opener-Policy: same-origin
```

- **Cloudflare Pages / Netlify**: `public/_headers` is copied into `dist/` and applies them.
- **Other hosts** (e.g. Vercel, S3/CloudFront, nginx): configure the same two headers for all
  paths, plus an SPA fallback that serves `index.html` for unknown routes.
- The dev server (`metro.config.js`) and `scripts/serve-web.mjs` already send them.

The Playwright smoke test fails if the page is not cross-origin isolated, if SQLite/WASM logs
console errors, or if progress loaded from the database is not rendered.
