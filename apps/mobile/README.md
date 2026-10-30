# @english-learn/mobile

Expo (SDK 58) app shell: expo-router screens, SQLite persistence via `expo-sqlite`, and a static
web build. Offline-first: no network or AI at runtime. UI copy is Spanish.

## Structure

| Path                  | Responsibility                                                       |
| --------------------- | -------------------------------------------------------------------- |
| `src/app/`            | Routes only (`/`, `/placement`, `/lesson/[id]`, `/review`, `/about`) |
| `src/features/*`      | Feature screens; containers load data, views are pure (props only)   |
| `src/infrastructure/` | Adapters: `SystemClock`, SQLite wiring, `AppServicesProvider` (DI)   |
| `src/shared/ui/`      | Notebook design system: theme tokens, `useTheme`, UI primitives      |
| `src/testing/`        | Test helpers (in-memory `ProgressRepository`)                        |
| `e2e/`                | Playwright tests against the exported web build                      |

Features read `ProgressRepository`, `SettingsRepository`, `Clock`, `random` (an `Rng`) and
`sounds` (a `SoundPlayer`) from `useAppServices()`. The root layout provides the SQLite-backed
repositories (`@english-learn/storage-sqlite`, migrated in `onInit`), the system clock,
`Math.random` and the sound player (expo-audio on native, Web Audio on web); tests wrap
components in `<AppServicesProvider services={...}>` with in-memory fakes and a deterministic rng.

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
  **Word lookups cap the grade**: the reducer's `lookup` action records the items whose glossary
  entry the learner opened (see "Word lookup" below), at any point of the session; an exercise
  answered after that marks those of its items `lookedUp`, and `applyLessonResults` caps their
  grade at 3 ("almost") — a wrong answer stays wrong. Verdicts, accuracy and XP are unchanged.
  Lessons and reviews share it.
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

## Word lookup (`src/features/glossary/`)

Learners look up the Spanish of English words and phrases from the static glossary
(`corpus.glossaryIndex`, `annotateText` from `@english-learn/domain`; no network, no AI).

- **Interaction**: on web with a mouse, hovering a word for 250 ms shows a tooltip; a click, or
  Enter / Space on a focused word, opens the card as a dialog. On native a tap opens it. It
  closes on a tap / click outside, Escape (focus goes back to the word), any scroll, a resize,
  "Cerrar" (native) or opening another word. Opening a card plays the soft `tap` sound (muting
  applies; hovering is silent). A phrase (`wake up`) is one target spanning its words.
- **Card** (`lookup-card.tsx`): the learner's own dictionary slip, not the teacher's red pen:
  sheet paper, hairline border, hard offset shadow, headword in Bricolage, part of speech in
  Spanish (small, muted; next to the headword when all senses share it), 1–3 senses in
  Atkinson, and a thin tab in the topic's highlighter on the left edge. Light and dark themes.
- **Positioning**: web anchors the card to the word (`model/popover-position.ts`: under it, or
  above when there is no room below; clamped to a 16 px viewport margin and narrower on small
  screens), in a portal on `document.body` so no scroll container clips it. Native shows a
  bottom sheet-style card in a transparent `Modal`: nested `Text` spans cannot be measured, so
  anchoring would be guesswork, and the bottom of the screen is in reach of the thumb.
- **Rendering**: `GlossaryText` / `GlossaryRuns` annotate a text once (memoized) and render the
  words with an entry as inline targets: a nested `Text` on native (the paragraph wraps and is
  read as one), a `<span role="button" tabindex="0">` on web (react-native-web would render a
  `<button>`, which does not wrap or select). Targets are labelled "<word>, ver traducción"
  with a hint. Linked words get a dotted underline in the muted ink at ~55 % opacity.
- **Where** (`features/lesson/model/lookup-policy.ts`, the locking matrix): only English text
  inside exercises, their feedback and the summary; never Spanish text or UI copy. What the
  exercise evaluates is locked until the answer is checked; then everything unlocks. Locked
  words render as plain text (no underline, no interaction, no "locked" affordance).

  | Area                                   | Before checking             | After |
  | -------------------------------------- | --------------------------- | ----- |
  | vocab prompt                           | yes, except the quoted term | yes   |
  | vocab options (English, "Choose the…") | no (Spanish options never)  | yes   |
  | cloze sentence                         | yes                         | yes   |
  | cloze chips (answer + distractors)     | no                          | yes   |
  | translation choice sentence            | no                          | yes   |
  | word order tokens and built sentence   | no                          | yes   |
  | translate write                        | nothing English shown       | —     |
  | reading title, text and questions      | yes                         | yes   |
  | reading options                        | no                          | yes   |
  | feedback margin note (English answer)  | —                           | yes   |
  | summary "Para repasar" terms           | yes                         | yes   |

  The vocab term is locked by its character range and, for "What does 'X' mean in 'Y'?", by its
  entry ids wherever it appears. The quoted Spanish term of "Choose the English for 'X'." never
  links. The **placement test** has no `GlossaryProvider`, so nothing links there.

- **First-time hint**: "Toca una palabra para ver su traducción" (web with a mouse: "Pasa el
  mouse o haz clic en una palabra para ver su traducción") above exercises that have lookups,
  until the learner taps "Entendido" or opens a first card; stored with
  `SettingsRepository.setLookupHintDismissed()`.
- **SRS signal**: `SessionGlossary` maps each opened entry to the lesson items whose term it is
  (`model/item-entries.ts`, built once per corpus: the term, without / with its parenthesized
  part, each side of a `/`, and the part before a `+ pattern`, must annotate to exactly one
  linked word or phrase; grammar items and sentences match nothing) and sends them to the
  session reducer (`lookup` action). See "Lessons" for the grade cap.
- **Accessibility**: targets are focusable buttons (web) / button-role spans (native); the web
  dialog has `role="dialog"`, takes focus and returns it on Escape; the native card is a modal
  with a polite live region and a "Cerrar" button. The feedback's margin note stays readable by
  screen readers when its answer links.

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
not due; those are untouched). XP is answer XP only, no completion bonus. Home shows a sticky note
"Repaso, N pendientes" (same plan) with a "Repasar" button, or "Nada para repasar hoy".

## Design: "el cuaderno de inglés" (`src/shared/ui/`)

The UI borrows from a school English notebook: ruled paper, blue ballpoint ink, yellow
highlighter and the teacher's red pen. Boldness is spent on the answer feedback; everything else
stays quiet.

- **Tokens** (`theme.ts`): paper, sheet, rule, ink, text, muted text, highlighter, red pen and
  success, for light and a "cuaderno nocturno" dark palette.
- **Colored highlighters** (`palette.highlighters`): yellow `#FFE135`, pink, green, orange, sky
  and lilac (slightly softer in dark mode), always with dark text (≥ 4.5:1, tested). Yellow
  means "correct" (answers, streak) and nothing else. The others carry meaning, never
  decoration (`features/topics/topic-colors.ts`): each topic has a hand-picked color (neighbors
  in a level's index never share one; unknown topics fall back to a stable hash), used for the
  topic tabs on the home index, the progress line and label of lessons and reviews, and the small
  tabs on the summary's "Para repasar"; each CEFR level has one (placement result); the review
  sticky note changes paper daily among pink, green, orange and sky. Ink stays the structural
  color (text, buttons, links); no gradients. `useTheme()` follows the system color
  scheme (`app.json` `userInterfaceStyle: automatic`); `ThemeOverride` forces one for a subtree
  (the sticky note is always yellow paper). Styles are built per scheme with `themedStyles`.
- **Fonts** (bundled with `expo-font` + `@expo-google-fonts/*`, so they work offline and are
  same-origin on web): Bricolage Grotesque for headings and big numbers, Atkinson Hyperlegible
  for body and UI text, Caveat only for the teacher's notes and the summary grade. The root layout
  keeps the splash screen up until they load.
- **Primitives**: `Text` (variants and tones), `Button` (primary ink, secondary outline, text),
  `ScreenContainer` (one ≤ 560 px column; on wide screens a notebook margin rule; optional pinned
  footer), `RuledArea` (ruled lines behind exercise prompts only), `Highlight` (highlighter mark,
  optional one-off swipe that respects reduced motion), `MarginNote` (red-pen handwriting),
  `StickyNote` (the only rotated element), `PaperStrip` (word-order tokens), `ProgressLine`,
  `ChoiceRow` (radio rows), `struckText` (red-pen strike; on Android the struck text itself is
  red pen, since the line follows the text color there).
- **Header**: on web the stack header is `NotebookHeader` (`shared/navigation/`), laid out in the
  same ≤ 560 px column as the page and continuing its margin rule; native platforms keep the
  native header.
- **Feedback** (`features/lesson/components/answer-feedback.tsx`): correct → the learner's answer
  is swiped with the highlighter and a green "Correcto"; wrong → struck through in red pen with a
  margin note "Era: …"; almost → only the words that are off are struck (`model/answer-diff.ts`)
  with "Casi. Fíjate: …". The marking is hidden from screen readers, which get a plain alert
  ("Incorrecto. Respuesta correcta: …"). Choice exercises (vocab, cloze, translation choice,
  reading) also mark their options once checked: the learner's wrong pick gets a red-pen outline
  and is struck through, the right option is highlighted with an ink check and the word
  "correcta", the rest dim; options are announced as "…, seleccionada, incorrecta" / "…,
  respuesta correcta". Placement has no feedback, so it never marks.
- **Summary** (lesson and review): the red Caveat grade, the stats, then "Para repasar": up to six
  missed items (wrong or almost) with their Spanish gloss (`model/items-to-review.ts`), or a
  short line when everything was right.
- **Sounds** (`src/infrastructure/sound/`): six short sounds synthesized by
  `scripts/generate-sounds.mjs` (deterministic, no dependencies; `pnpm generate:sounds`
  rewrites `assets/sounds/*.wav`, 16-bit mono 44.1 kHz, -6 dBFS peak). `tap` when choosing an
  option or a word, `correct` / `almost` / `wrong` when feedback appears, `complete` when a
  lesson, review or placement result is saved, then `streak` when that session extended the
  streak. Placement only taps (it gives no per-question feedback). Sounds are loaded once, never
  block the UI and log instead of throwing. Native: expo-audio players (`expo-sound-player.ts`);
  iOS respects the silent switch. Web (`expo-sound-player.web.ts` over
  `web-audio-sound-player.ts`): each WAV is downloaded once with `fetch` (so the service worker
  serves it offline), decoded and played from memory with Web Audio; the `AudioContext` is
  created and resumed in the learner's first tap (autoplay policy). No `<audio>` element loads
  anything: WebKit loads media through its own media pipeline, outside the page's fetch path
  (on Linux WebKit, Playwright saw each expo-audio `<audio>` load twice: a `status 0` response
  not from the worker, then the worker's 200), so `fetch` is the one loading path that is
  guaranteed to go through the service worker.
  e2e builds (`EXPO_PUBLIC_E2E=1`) log each started sound in `window.__e2e.playedSounds`;
  `check-prod-bundle` fails if that log reaches `dist/`. Haptics (expo-haptics):
  light impact / notifications on iOS, permission-free system haptics on Android, none on web;
  muting does not affect them. The speaker button ("Silenciar sonidos" / "Activar sonidos") sits
  at the top of home and in the header of lesson, review and placement; the choice is stored in
  SQLite (`setting` table) and defaults to on.
- **Word lookup**: see "Word lookup" above.
- **Accessibility floor**: touch targets ≥ 44 pt, an ink focus ring on web (`:focus-visible`,
  `web-global-styles.ts`), AA contrast for text (`theme.test.tsx` asserts ≥ 4.5:1 for text,
  muted, ink, success and red pen on paper and sheet, and dark text on every highlighter, in
  both schemes), reduced motion
  respected, labels kept.

## Commands

Run from this folder, or from the repo root with `pnpm --filter @english-learn/mobile <script>`.

```sh
pnpm start          # Expo dev server (press w for web, i/a for simulators)
pnpm web            # dev server, web only
pnpm lint           # ESLint (eslint-config-expo); also run by `pnpm lint` at the root
pnpm typecheck      # tsc --noEmit
pnpm test           # Jest (jest-expo + React Native Testing Library), then node --test scripts/
pnpm generate:sounds # rewrite assets/sounds/*.wav
pnpm generate:pwa-icons # rewrite public/icons/*.png and public/apple-touch-icon.png from the app icon

pnpm export:web     # production static SPA export to dist/, then sw.js, then checks (no e2e hooks; PWA)
pnpm serve:web      # serve dist/ on http://localhost:4173 with the required headers
pnpm export:web:e2e # e2e export to dist-e2e/ (EXPO_PUBLIC_E2E=1), with its sw.js
pnpm e2e:web        # export:web:e2e, then Playwright against dist-e2e/
```

### Screenshots (dev tool)

`node scripts/screenshots.mjs <out-dir> [--skip-build] [--port 4174]` builds `dist-e2e/` (skip
with `--skip-build` if it is fresh), serves it and walks the app with Playwright Chromium:
home (fresh and with progress plus pending reviews via `?today=`), placement intro and question,
one screen per exercise type, correct / almost / wrong feedback (choice options marked), word
lookups on the reading passage (hover tooltip on desktop, the open card mid-passage and at its
end), reading
feedback, the leave dialog, the lesson summary with words to review, review and a perfect review
summary, about and the "open in another tab" error screen. Every screen is captured at
390×844 and 1280×800, in light and dark color schemes (`mobile-dark-09-feedback-wrong.png`, …);
long screens also get a `-full.png`. It is for design review, not part of the test suite.

### E2E-only clock override

E2E tests simulate days passing with `?today=YYYY-MM-DD` on the page URL (e.g.
`/?today=2030-01-03`); it replaces `Clock.today()` for that page load (response timing keeps
the real time). It only exists in builds exported with `EXPO_PUBLIC_E2E=1`
(`src/infrastructure/clock/app-clock.ts`): Expo inlines the variable at build time, so in the
production export the branch and its module are dropped. `scripts/check-prod-bundle.mjs` (run
by `export:web`, hence in CI) fails if the override ever shows up in `dist/`.

`e2e/offline.spec.ts` covers the PWA on Chromium and WebKit: after one online visit it goes
offline (`context.setOffline`), reloads `/` and opens `/lesson/a2.daily-routine.lesson-001`; the
app renders with its SQLite data, `crossOriginIsolated` is true, fonts and sounds come from the
worker with no failed request, the tap and feedback sounds really play (`__e2e.playedSounds`)
and a fetch of a non-precached URL fails (proof it is offline).
The update test sets the cookie `e2e-sw-version=2`; the test server, started with `--e2e-hooks`
(Playwright's `webServer` only), then appends a comment to `/sw.js` for that profile only, which
the browser treats as a new deploy. Specs that write and reload at once call
`waitForServiceWorker` first so the first visit's precaching does not slow the write down.

First-time Playwright setup: `pnpm exec playwright install chromium webkit`. Every spec runs on
Chromium and on WebKit (Safari / iOS web). Specs import `test` from `e2e/support/test.ts`, which
runs each test in a fresh persistent browser profile: WebKit has no OPFS in Playwright's default
ephemeral contexts (like Safari Private Browsing), so expo-sqlite could not open the database
there. Playwright's WebKit also shares website data between profiles, so the webkit project runs
on one worker and each test first empties OPFS and removes service workers and their caches (from
`/metadata.json`, a static file: every navigation without a file now gets the SPA).

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
removes all but `INTERNET` (kept for development builds talking to Metro). expo-audio adds
`MODIFY_AUDIO_SETTINGS` (a normal permission); its plugin is configured without microphone,
`RECORD_AUDIO` or background playback. Haptics use `performAndroidHapticsAsync`, which needs no
`VIBRATE`. An empty
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
- The fonts are bundled assets served from the same origin, so `require-corp` does not affect
  them.

## Offline web app (PWA)

The web build is an installable PWA that works fully offline after the first visit.

- **Service worker** (`scripts/service-worker.mjs`, hand-written, no dependency):
  `scripts/build-service-worker.mjs` runs after every export, hashes every file in the export
  (SHA-256, 16 hex digits; `index.html` as `/`; not `_headers`, `metadata.json` or maps) and
  writes `sw.js` with that manifest inlined. The version is a hash of the manifest, so `sw.js`'s
  bytes change exactly when a file does, and an identical rebuild produces an identical worker.
  Why not Workbox: the worker must rebuild responses with COOP/COEP, verify hashes, answer byte
  ranges and never skip waiting on its own; that is ~150 testable lines, while `workbox-build`
  would add a large dependency tree and still need custom plugins for it.

  | Request                          | Strategy                                                               |
  | -------------------------------- | ---------------------------------------------------------------------- |
  | Navigation (`mode === navigate`) | Network first; cached shell when offline, on a 5xx or after 4 s        |
  | Precached file (JS, fonts, WAV…) | Cache first (content-hashed); `Range` answered with 206 from the cache |
  | Anything else                    | Not handled (browser default)                                          |

  Navigations are recognized by `request.mode`, never by the path: lesson ids contain dots.
  Install downloads with `cache: "reload"`, checks each file's hash (a deploy racing the install
  fails it, and the browser retries later), and copies unchanged files from the previous
  version's cache. Activate deletes other versions' caches and claims the open pages.

- **Cross-origin isolation offline**: every response the worker returns gets
  `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin`
  (stored with the cached copy and set again if missing), so expo-sqlite keeps
  `SharedArrayBuffer` offline. The e2e offline test asserts the shell response came from the
  worker with both headers and that `crossOriginIsolated` is true.
- **Registration** (`src/infrastructure/pwa/`): production web exports only (`__DEV__` false,
  e2e export included), never the dev server or native; `/sw.js` with scope `/` and
  `updateViaCache: "none"`, after `load`. It checks for a new version when the app comes back to
  the foreground and hourly.
- **Updates**: a new version installs in the background and waits. `UpdateBanner`
  (`src/features/app-update/`) shows "Hay una versión nueva" with "Actualizar" above the page (in
  the flow, so it never covers a lesson's buttons). Only that press sends `SKIP_WAITING` and
  reloads once the new worker takes control; nothing reloads on its own, mid-lesson or not.
- **Manifest and HTML**: `public/manifest.webmanifest` ("English Learn" / "English", `es`,
  standalone, paper `#F7F9FC` theme and background, 192/512 icons and a maskable 512). With
  `web.output: "single"` the HTML is customized in `public/index.html` (created with
  `npx expo customize public/index.html`, per the SDK 58 PWA guide): manifest link, light/dark
  `theme-color`, `apple-touch-icon` (180 px, opaque) and the `apple-mobile-web-app-*` tags.
  `pnpm generate:pwa-icons` derives the icons from `assets/images/icon.png` with a tiny built-in
  PNG codec (`scripts/png.mjs`); the icon is full-bleed with its glyph inside the maskable safe
  zone, so the 512 px icon doubles as the maskable one.
- **Headers** (`public/_headers`): `Cache-Control: no-cache` for `/`, `/index.html`, `/sw.js` and
  the manifest (deploys propagate); a year, immutable, for the hashed `/_expo/static/*` and
  `/assets/*`.
- `scripts/check-prod-bundle.mjs` (run by `export:web`) also fails if `sw.js` is missing, stale
  or does not precache the shell, the SQLite WASM and the manifest, or if the manifest is
  invalid or not linked.

The Playwright smoke test fails if the page is not cross-origin isolated, if SQLite/WASM logs
console errors, or if progress loaded from the database is not rendered.

## Known limitations

- **Word lookup on native is not verified on a device yet.** RNTL covers the native card;
  e2e covers web (Chromium and WebKit). Android draws the lookup underline solid and in the text
  color (no dotted style or decoration color there). Inside a revealed choice row (a radio) or
  the feedback, a screen reader reads the row's label rather than each lookup button.

- **Sounds are not verified on a device yet.** Unit tests cover both players with fakes, and e2e
  checks on Chromium and WebKit (macOS and Linux) that the web build plays them through Web Audio,
  offline included. Real iOS / Safari still needs a manual check: Web Audio on iOS follows the
  silent switch (like the native app), and the first sound plays only after the first tap. Android
  playback and haptics also need a device.

- **Reading grades all its items with one verdict.** A reading exercise is correct only if every
  question is, and that single verdict (and its response time) is applied to every item the
  exercise lists in `itemIds`. The content schema does not link a question to the items it
  tests, so one wrong answer counts as a miss for all of the passage's items, and a slow read
  lowers all of them to grade 4. Fixing it needs per-question `itemIds` in the content schema;
  until then, reading items may come back for review sooner than strictly needed.
- **One tab at a time on web.** expo-sqlite holds the database file exclusively; a second tab
  shows "La app ya está abierta en otra pestaña." until the first one is closed. With the service
  worker running, WebKit may release the closed tab's database a moment later, so the first
  "Reintentar" right after closing it can still show the message; pressing it again works.
- **iOS / Safari PWA.** Installing is manual (Share → "Añadir a pantalla de inicio"); there is no
  install prompt. The home screen app has its own storage, separate from Safari's: progress made
  in the Safari tab does not carry over to the installed app. Safari may evict the data of a site
  not used for weeks (ITP); the installed app is exempt from that 7-day rule. Offline e2e runs in
  Playwright's WebKit, not on an iPhone: check Add to Home Screen and airplane mode on a device.
- **The first visit must be online and complete its precaching** (about 3.5 MB) before the app
  works offline; an update downloads only the files that changed.
- **No storage in private browsing on Safari / WebKit.** Without OPFS the database cannot open
  and the app shows "No pudimos abrir tus datos."
