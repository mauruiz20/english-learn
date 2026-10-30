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

### When the database cannot open

`SqliteAppServicesProvider` wraps the app in `AppErrorBoundary`
(`src/infrastructure/errors/`). If the database fails to open or migrate, `SQLiteProvider`'s
`onError` throws a `DatabaseOpenError` and the boundary shows a message with "Reintentar"
instead of a blank screen; any other render error shows "Algo salió mal.". "Reintentar"
reloads the page on web (expo-sqlite's worker cannot reopen after a failed open) and remounts
the app on native. Messages by cause (`database-open-error.ts`):

- **Another tab has the app open** (web): expo-sqlite keeps OPFS sync access handles for the
  whole session and only one tab can hold them. Recognized by the messages browsers actually
  report (Chromium: "Access Handles cannot be created if there is another open Access Handle…";
  WebKit: "The object is in an invalid state."): "La app ya está abierta en otra pestaña."
- **Database from a newer app version** (`SchemaTooNewError` from `migrate`): asks to update.
- **Anything else** (corrupt file, storage disabled, e.g. WebKit without OPFS in private
  browsing): "No pudimos abrir tus datos."

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
  An item that is **not due yet** (`dueDate > today`, e.g. a lesson replayed the same day) is
  only practiced: a passing grade leaves its state unchanged; a wrong answer still applies the
  SM-2 lapse (forgetting is real evidence). A **new** item (no state yet) answered wrong is not a
  lapse (nothing was learned yet to forget): it starts fresh with the default ease, 0 reps and
  0 lapses, due tomorrow.
- `application/complete-session.ts`: saves a finished lesson or review through
  `ProgressRepository.saveSessionResults`, which reads the current states and streak and writes
  states + XP + streak in ONE transaction (all or nothing). XP = sum of `xpForAnswer`, plus the
  lesson completion bonus only the first time a lesson is completed (some item had no state);
  replays and reviews earn answer XP only.
- `use-exercise-session.ts`: hook shared by lesson and review (answer → feedback → next →
  save). Saving is guarded against double submission; a failed save shows "Reintentar"; the
  header back button and swipe gesture are disabled while saving. The browser back button is
  not blocked during the save: the save keeps running after the screen goes away, and the app's
  repository is wrapped in `awaitPendingWrites` (`src/infrastructure/persistence/`), so every
  read (home's reload on focus) waits for in-flight writes and shows the committed progress.
- **Leaving mid-session asks first.** Once at least one answer was given and the lesson, review
  or placement test is not finished, `useLeaveConfirmation` (`src/shared/navigation/`, built on
  expo-router's `usePreventRemove`) blocks leaving and shows an in-app dialog ("Seguir aquí" /
  "Salir"; not `Alert` or `window.confirm`). It covers the header back button, the swipe
  gesture, Android back and, on web, the browser back button (the URL is restored when the
  learner stays); on web, reloading or closing the tab mid-session also shows the browser's own
  "leave site?" prompt. Leaving saves nothing.
- `components/`: one presentational component per exercise type, `ExerciseBody` (picks the
  component by type; tagged `testID="exercise-<id>"`) and `AnswerFeedback`.
- `lesson-container.tsx` / `lesson-view.tsx`: the `/lesson/[id]` screen, summary and unknown-id
  message.

Home lists the lessons of the level nearest to the placement level that has lessons (ties go to
the lower level; with MVP content A1 → A2 and B2/C1 → B1), or A2 without a placement. A lesson
shows as done once every item it practices has a review state.

## Placement test (`src/features/placement/`)

`/placement`: intro, then the adaptive test from the domain (`createPlacementSession` /
`answer` / `placementResult`, max 20 questions). Questions from `corpus.placement` are mapped to
`PlacementCandidate`s (`optionCount` = options, or `answers[0]` + distractors for cloze) and
rendered as regular exercises (`prepareExercise`, `ExerciseBody`, `gradeExercise`) with a
"Siguiente" button and no per-question feedback. The result screen shows the estimated level, a
short CEFR description and which lessons the learner gets. Only `savePlacementResult` is written
(never review states, XP or streak); "Repetir test de nivel" on home retakes it and overwrites
the result.

## Daily review (`src/features/review/`)

`/review` plans the session with `selectSession({ maxReviews: 20, maxNew: 0 })` over the due
states that some non-reading exercise covers (new items come from lessons only). For each due
item, in priority order, it picks one exercise that practices it, preferring a different type
than the previous pick, chosen with the injected rng; an exercise covering several due items
reviews all of them. Only the due items are saved (an exercise may also practice items that are
not due; those are untouched). XP is answer XP only, no completion bonus. Home shows
"Repaso: N pendientes" (same plan) with a "Repasar" button, or "Nada para repasar hoy".

## Commands

Run from this folder, or from the repo root with `pnpm --filter @english-learn/mobile <script>`.

```sh
pnpm start          # Expo dev server (press w for web, i/a for simulators)
pnpm web            # dev server, web only
pnpm lint           # ESLint (eslint-config-expo); also run by `pnpm lint` at the root
pnpm typecheck      # tsc --noEmit
pnpm test           # Jest (jest-expo + React Native Testing Library)

pnpm export:web     # production static SPA export to dist/ (+ check it has no e2e hooks)
pnpm serve:web      # serve dist/ on http://localhost:4173 with the required headers
pnpm export:web:e2e # e2e export to dist-e2e/ (EXPO_PUBLIC_E2E=1)
pnpm e2e:web        # export:web:e2e, then Playwright against dist-e2e/
```

### Screenshots (dev tool)

`node scripts/screenshots.mjs <out-dir> [--skip-build] [--port 4174]` builds `dist-e2e/` (skip
with `--skip-build` if it is fresh), serves it and walks the app with Playwright Chromium:
home (fresh and with progress plus pending reviews via `?today=`), placement intro and question,
one screen per exercise type, correct / almost / wrong feedback, the leave dialog, the lesson
summary, review, about and the "open in another tab" error screen. Every screen is captured at
390×844 and 1280×800, in light and dark color schemes (`mobile-dark-09-feedback-wrong.png`, …);
long screens also get a `-full.png`. It is for design review, not part of the test suite.

### E2E-only clock override

E2E tests simulate days passing with `?today=YYYY-MM-DD` on the page URL (e.g.
`/?today=2030-01-03`); it replaces `Clock.today()` for that page load (response timing keeps
the real time). It only exists in builds exported with `EXPO_PUBLIC_E2E=1`
(`src/infrastructure/clock/app-clock.ts`): Expo inlines the variable at build time, so in the
production export the branch and its module are dropped. `scripts/check-prod-bundle.mjs` (run
by `export:web`, hence in CI) fails if the override ever shows up in `dist/`.

First-time Playwright setup: `pnpm exec playwright install chromium webkit`. Every spec runs on
Chromium and on WebKit (Safari / iOS web). Specs import `test` from `e2e/support/test.ts`, which
runs each test in a fresh persistent browser profile: WebKit has no OPFS in Playwright's default
ephemeral contexts (like Safari Private Browsing), so expo-sqlite could not open the database
there. Playwright's WebKit also shares website data between profiles, so the webkit project runs
on one worker and each test first empties OPFS.

## Android builds

App identity lives in `app.json`: version `0.1.0`, `android.versionCode` `1` (increment it for
every Play Store upload), portrait only. The package name `com.mruizdev.englishlearn` is a
placeholder and can still change before the first Play Store release; after that it is permanent.
`eas.json` reads versions from `app.json` (`appVersionSource: "local"`).

| Profile      | Output                        | Use                                      |
| ------------ | ----------------------------- | ---------------------------------------- |
| `preview`    | `.apk`, internal distribution | Install directly on a device or emulator |
| `production` | `.aab` (app bundle)           | Upload to Google Play                    |

**With an Expo account** (cloud build, EAS handles signing):

```sh
npx eas-cli@latest build -p android --profile preview
```

**Without an account** (local build; needs a JDK and the Android SDK):

```sh
npx expo prebuild -p android   # generates android/ (Continuous Native Generation; do not commit it)
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

The generated Gradle project signs `release` with the debug keystore, which is fine for sideloading
but not for Google Play. For a store release, create an upload keystore and configure it (or let
EAS manage credentials) instead of committing signing material.

**Permissions.** The app needs none at runtime. The prebuild template adds `INTERNET`,
`SYSTEM_ALERT_WINDOW`, `VIBRATE` and `READ`/`WRITE_EXTERNAL_STORAGE`; `android.blockedPermissions`
removes all but `INTERNET` (kept for development builds talking to Metro). An empty
`android.permissions` array does **not** remove template permissions: it only lists permissions to
add. Check with `npx expo config --type introspect` (offline); libraries' own manifests merged
later by Gradle are not shown there, so inspect the merged manifest of a real build too.

## Hosting the web build

`expo-sqlite` on web runs SQLite as WebAssembly and needs `SharedArrayBuffer`, which browsers only
enable on cross-origin isolated pages. Every response must carry:

```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

`require-corp`, not `credentialless`: Safari / WebKit does not implement `credentialless`, so with
it the page is not cross-origin isolated on Safari and iOS and the database cannot open. The app
loads nothing cross-origin, so `require-corp` costs nothing today. A cross-origin resource added
later (fonts, images, analytics) must be served with `Cross-Origin-Resource-Policy: cross-origin`
(or CORS), or the browser will block it.

- **Cloudflare Pages / Netlify**: `public/_headers` is copied into `dist/` and applies them.
- **Other hosts** (e.g. Vercel, S3/CloudFront, nginx): configure the same two headers for all
  paths, plus an SPA fallback that serves `index.html` for unknown routes.
- The dev server (`metro.config.js`) and `scripts/serve-web.mjs` already send them.

The Playwright smoke test fails if the page is not cross-origin isolated, if SQLite/WASM logs
console errors, or if progress loaded from the database is not rendered.

## Known limitations

- **Reading grades all its items with one verdict.** A reading exercise is correct only if every
  question is, and that single verdict (and its response time) is applied to every item the
  exercise lists in `itemIds`. The content schema does not link a question to the items it
  tests, so one wrong answer counts as a miss for all of the passage's items, and a slow read
  lowers all of them to grade 4. Fixing it needs per-question `itemIds` in the content schema;
  until then, reading items may come back for review sooner than strictly needed.
- **One tab at a time on web.** expo-sqlite holds the database file exclusively; a second tab
  shows "La app ya está abierta en otra pestaña." until the first one is closed.
- **No storage in private browsing on Safari / WebKit.** Without OPFS the database cannot open
  and the app shows "No pudimos abrir tus datos."
