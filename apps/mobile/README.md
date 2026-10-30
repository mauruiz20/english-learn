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
| `src/testing/`        | Test helpers (in-memory `ProgressRepository`)                        |
| `e2e/`                | Playwright tests against the exported web build                      |

Features read `ProgressRepository`, `Clock` and `random` (an `Rng`) from `useAppServices()`. The
root layout provides the SQLite-backed implementations (`@english-learn/storage-sqlite`, migrated
in `onInit`), the system clock and `Math.random`; tests wrap components in
`<AppServicesProvider services={...}>` with in-memory fakes and a deterministic rng.

Content comes from `@english-learn/content/corpus` (generated, bundled, no Zod at runtime).

## Lessons (`src/features/lesson/`)

- `model/` (pure, unit-tested): `prepareExercise` shuffles options / scrambles tokens with the
  injected rng; `gradeExercise` grades a response (option types and reading → correct/wrong;
  reading is correct only if every question is; word order → `matchAnswer` on the tokens joined by
  single spaces, only "correct" counts; translate-write → correct/almost/wrong); the
  `lessonSession` reducer (answering → feedback → next → finished summary with verdicts, accuracy,
  XP and per-item outcomes); `applyLessonResults` turns the summary into SM-2 review states
  (worst grade per item; `EXPECTED_MS` per type: vocab 8 s, cloze 10 s, translation choice 12 s,
  word order 20 s, translate-write 30 s, reading 60 s — slower correct answers get grade 4).
- `application/complete-lesson.ts`: saves review states, adds XP and records streak activity.
- `components/`: one presentational component per exercise type plus `AnswerFeedback`.
- `lesson-container.tsx` / `lesson-view.tsx`: the `/lesson/[id]` screen, summary and unknown-id
  message.

Home lists the lessons of the placement level, or A2 when there is no placement or the level has
no lessons (MVP content covers A2 and B1). A lesson shows as done once every item it practices has
a review state.

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
pnpm e2e:web        # Playwright tests (serve dist/ themselves; run export:web first)
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
