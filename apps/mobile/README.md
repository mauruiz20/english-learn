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

Features read `ProgressRepository`, `SettingsRepository`, `Clock`, `random` (an `Rng`),
`randomBytes` (for event ids) and `sounds` (a `SoundPlayer`) from `useAppServices()`. The root
layout provides the SQLite-backed repositories (`@english-learn/storage-sqlite`, prepared in
`onInit` by `initProgressStore`), the system clock, `Math.random`, expo-crypto's
`getRandomValues` and the sound player (expo-audio on native, Web Audio on web); tests wrap
components in `<AppServicesProvider services={...}>` with in-memory fakes and deterministic
random sources.

### Progress is an event log

Progress is stored as the domain's append-only event log (`@english-learn/domain`, "Progress
event log"); the progress tables are a cache of its fold that every write refreshes, and reads
come from that cache. The app only builds events (`src/features/progress/progress-events.ts`,
UUIDv7 ids from `clock.nowMs()` and `randomBytes`, stamped with the install's device id):

- a finished lesson or review → one `item_reviewed` per item with its final grade and one
  `session_completed`, sharing a session id and the save's `today`;
- a finished placement test → `placement_completed`.

`initProgressStore` (`src/infrastructure/persistence/`) runs on every start: migrations, the
device id (generated once), and for learners upgrading from before the event log ONE
`baseline_imported` event with their states, XP, streak and placement, plus
`completedLessonIds` = the lessons whose items all have a review state (shown as done on home),
so replaying them earns no bonus again. Their progress is unchanged by the upgrade.
E2E-only: `?rebuildProgress=1` (builds with `EXPO_PUBLIC_E2E=1`) recomputes the cache from the
log at start.

### When the database cannot open

`SqliteAppServicesProvider` wraps the app in `AppErrorBoundary`
(`src/infrastructure/errors/`). If the database fails to open or migrate, `SQLiteProvider`'s
`onError` throws a `DatabaseOpenError` and the boundary shows a message with "Reintentar"
instead of a blank screen; any other render error shows "Algo salió mal.". "Reintentar"
reloads the page on web (expo-sqlite's worker cannot reopen after a failed open) and remounts
the app on native. Messages by cause (`database-open-error.ts`):

- **Another tab has the app open** (web), when the ownership check below could not prevent it:
  recognized by the messages browsers actually report (Chromium: "Access Handles cannot be
  created if there is another open Access Handle…"; WebKit: "The object is in an invalid
  state."): "La app ya está abierta en otra pestaña."
- **Database from a newer app version** (`SchemaTooNewError` from `migrate`): asks to update.
- **Anything else** (corrupt file, storage disabled, e.g. WebKit without OPFS in private
  browsing): "No pudimos abrir tus datos."

### One tab at a time (web)

expo-sqlite keeps OPFS sync access handles for the whole page session and a file accepts only one,
so only one page can hold the database. Closing the database does not release them, and after a
failed open expo-sqlite's worker cannot open again until the page reloads. So the database opens
only once this page owns it (`src/infrastructure/persistence/ownership/`):

1. **Lock**: the page takes the Web Lock `english-learn-db-owner` (held until it unloads).
2. **Ask**: if the lock is taken, it posts `want-db` on the BroadcastChannel `english-learn-db`;
   the owner answers `owned` within 400 ms → "La app está abierta en otra pestaña o ventana"
   with "Usar aquí". No answer means the owner is unloading (reload, Google redirect return, update):
   wait up to 6 s for the lock.
3. **Probe**: a throwaway worker opens and closes a sync access handle on each of expo-sqlite's
   files; while they are busy (the previous page's worker lets go a moment after its lock) it
   retries after 100, 200, 400, 800, 1600 and 2400 ms, with the normal loading state. Still busy
   → the "open in another tab" screen. Any other probe failure goes on to the normal open, which
   reports genuine errors (private mode, corrupt file, newer schema).
4. **"Usar aquí"** posts `release`. The owner refuses new writes and waits for the ones in flight
   (saves and the sync's, `createWriteTracker().drain()`), unmounts the app (stopping sync and its
   timers), replies `released` and reloads with a one-shot `sessionStorage` flag, so it shows
   "La app se abrió en otra pestaña" with its own "Usar aquí" (which takes the database back the
   same way). The new page then takes the lock and probes as above.

Without Web Locks the channel and the probe still apply. Native apps skip all of this.

Content comes from `@english-learn/content/corpus` (generated, bundled, no Zod at runtime).

## Lessons (`src/features/lesson/`)

- `model/` (pure, unit-tested): `prepareExercise` shuffles options / scrambles tokens with the
  injected rng; `gradeExercise` grades a response (option types and reading → correct/wrong;
  reading is correct only if every question is; word order → `matchAnswer` on the tokens joined by
  single spaces, only "correct" counts; translate-write → `matchPatternAnswer` against every
  sentence its answer patterns stand for, correct/almost/wrong); the
  `lessonSession` reducer (answering → feedback → next → finished summary with verdicts, accuracy,
  XP and per-item outcomes); `finalGrades` turns the summary into one FINAL grade per item
  (worst grade per item; `EXPECTED_MS` per type: vocab 8 s, cloze 10 s, translation choice 12 s,
  word order 20 s, translate-write 30 s, reading 60 s — slower correct answers get grade 4).
  How a grade moves the item through SM-2 is the domain's `applyReview`, applied by the fold: an
  item **not due yet** (e.g. a lesson replayed the same day) is only practiced (a passing grade
  leaves it unchanged, a wrong answer still lapses), and a **new** item answered wrong starts
  fresh, due tomorrow.
  **Word lookups cap the grade**: the reducer's `lookup` action records the items whose glossary
  entry the learner opened (see "Word lookup" below), at any point of the session; an exercise
  answered after that marks those of its items `lookedUp`, and `finalGrades` caps their
  grade at 3 ("almost") — a wrong answer stays wrong. Verdicts, accuracy and XP are unchanged.
  Lessons and reviews share it.
  **"Mi respuesta también es correcta"**: after a wrong or almost translate-write answer the
  feedback offers this quiet text button (`canDispute`). The reducer's `dispute` action regrades
  that attempt as correct (verdict, accuracy and XP of a correct answer; the feedback shows the
  answer highlighted with "Marcada como correcta"), and `finalGrades` gives its items grade 4
  (never 5), which replaces the wrong/almost grade in worst-grade-wins (the looked-up cap still
  applies). The save appends one `answer_disputed` event per disputed answer
  (`exerciseId, itemIds, answer` trimmed to 200 characters, `accepted: false`) with the session's
  events; the fold ignores it and the sync uploads it like any event, so the owner can review it
  (`pnpm --filter @english-learn/content disputed-answers`).
- `application/complete-session.ts`: saves a finished lesson or review as events with
  `ProgressRepository.appendEvents` (ONE transaction, all or nothing). XP = sum of `xpForAnswer`,
  plus the lesson completion bonus the first time a `lessonId` is completed (decided by the fold;
  before the event log it was "some item had no state yet"); replays and reviews earn answer XP
  only. The summary shows the XP and streak the fold produced (totals after minus before).
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
short CEFR description and which lessons the learner gets. Only a `placement_completed` event is
written (never review states, XP or streak); "Repetir test de nivel" on home retakes it and the
latest result wins.

## Daily review (`src/features/review/`)

`/review` plans the session with `selectSession({ maxReviews: 20, maxNew: 0 })` over the due
states that some non-reading exercise covers (new items come from lessons only). For each due
item, in priority order, it picks one exercise that practices it, preferring a different type
than the previous pick, chosen with the injected rng; an exercise covering several due items
reviews all of them. Only the due items are saved (an exercise may also practice items that are
not due; those are untouched). XP is answer XP only, no completion bonus. Home shows a sticky note
"Repaso, N pendientes" (same plan) with a "Repasar" button, or "Nada para repasar hoy".

## Account and sync (`src/features/account/`, `src/infrastructure/auth/`, `src/infrastructure/sync/`)

Optional, **web only, on `https://english.maumar.com.ar`** (and `http://localhost` for
development): the API's refresh cookie is `SameSite=Strict` on `english-api.maumar.com.ar`, so it
only works from the same site. On another host (the old `*.pages.dev`) `/cuenta` explains where
accounts are; in the Android app it says "Disponible próximamente en la app". Neither makes a
network call. `/privacidad` is the privacy policy (linked from `/cuenta` and `/about`).

- **Sign-in: OpenID Connect implicit redirect** (`oidc.ts`). The page is cross-origin isolated
  (COOP/COEP for expo-sqlite), so Google Identity Services' iframe and popups cannot work. "Continuar
  con Google" stores a random `state` and `nonce` (and where to return) in `sessionStorage` and
  navigates to Google with `response_type=id_token`. Google redirects to
  `<origin>/auth/callback#id_token=…&state=…`; the callback removes the fragment from history
  first, checks `state` (once, ≤ 10 min old), sends `{ idToken, nonce }` to `POST /v1/auth/google`
  in cookie mode (the API checks the token's `nonce` claim) and goes back.
- **Session** (`auth-session.ts`). Access token in memory only; the device remembers only
  `{ userId, email }` (`SettingsRepository.setAccount`). On start, with that marker, one refresh
  (cookie) restores the session; a 401 signs out, a network failure keeps the learner signed in.
  Refreshes are single-flight and serialized across tabs with `navigator.locks`
  (`english-learn-refresh`).
- **Sync** (`sync-engine.ts`, `sync-coordinator.ts`, `sync-triggers.ts`). Each `POST /v1/sync`
  uploads up to 500 unsynced events (and < 900 KB) and pulls the account's events after the
  cursor; it loops while events remain or `hasMore`, applies pulled events with
  `insertRemoteEvents` (refold), marks uploads synced and stores the cursor after each page.
  Network errors and 5xx back off exponentially with jitter (5 attempts), 429 waits
  `Retry-After`, 401 refreshes once, 409 `device_conflict` takes a new device id once, conflicts
  are logged. Triggers: sign-in (the first sync uploads the whole history, baseline included), app
  start, every saved session or placement, the `online` event, and every 5 minutes while visible.
  One sync at a time; a request during a sync runs once more afterwards. Status: `idle`,
  `syncing`, `synced(at)`, `offline`, `error`. A sync that brought progress bumps
  `progressVersion`, which reloads home.
- **Sign-out** revokes the session and either keeps this device's progress (default; it becomes
  unsynced, so the next account receives it) or deletes it. **Delete account** needs a Google
  sign-in < 5 min old: on `reauthentication_required` the app goes through Google again and deletes
  on return (only if the same account was picked).
- `EXPO_PUBLIC_API_BASE_URL` overrides the API (default `https://english-api.maumar.com.ar` in
  production builds, `http://localhost:8000` in development).
- **Google Cloud** (OAuth client `78200832989-odkefhj0s4vla7h5p83gevs2440mctev`): authorized
  JavaScript origins `https://english.maumar.com.ar` (and `http://localhost:8081` for dev);
  authorized redirect URIs `https://english.maumar.com.ar/auth/callback` (and
  `http://localhost:8081/auth/callback`).
- E2E (`e2e/account.spec.ts`) fakes Google and the API with a local server per test; the e2e build
  reads its URLs from `localStorage` (`english-learn.e2e.*`, dropped from production builds).
  `E2E_PORT` serves the export on another port when 4173 is taken.

## Design: "el cuaderno de stickers" (`src/shared/ui/`)

The UI borrows from a school English notebook: ruled paper, blue ballpoint ink, highlighters and
the teacher's red pen. It is also a game: every lesson is a sticker to win and stick on the
page, the streak is a chain of paperclips, XP fills sheets of stickers and achievements fill an
album. The play lives on home, the summary and the album; during an exercise there is only the
paper, the prompt and the teacher's marking.

- **Tokens** (`theme.ts`): paper, sheet, rule, ink (with `inkEdge`, the darker lip under ink
  keys), text, muted text, highlighter, red pen, success, `stickerEdge` (the white die-cut border)
  and `feedback` bands (`tint` + `ink` per verdict), for light and a "cuaderno nocturno" dark
  palette.
- **Colored highlighters = sticker colors** (`palette.highlighters`): sun `#FFD23F` (yellow),
  bubblegum, mint, coral (orange), sky and grape (lilac), slightly darker in dark mode, always with
  dark text (≥ 4.5:1, tested). Yellow means "correct" (answers, streak, the lesson to do next) and
  nothing else. The others carry meaning, never decoration (`features/topics/topic-colors.ts`):
  each topic has a hand-picked color (neighbors in a level's index never share one; unknown
  topics fall back to a stable hash), used for the topic labels and won stickers on the home
  path, the lesson's progress label and summary sticker, and the small tabs on the summary's
  "Para repasar"; each CEFR level has one (placement result); the review sticky note changes paper
  daily among pink, green, orange and sky. Ink stays the structural color (text, buttons, links);
  no gradients. `useTheme()` follows the system color scheme (`app.json`
  `userInterfaceStyle: automatic`); `ThemeOverride` forces one for a subtree (the sticky note is
  always light paper). Styles are built per scheme with `themedStyles`.
- **Fonts** (bundled with `expo-font` + `@expo-google-fonts/*`, so they work offline and are
  same-origin on web): Bricolage Grotesque for headings and big numbers, Atkinson Hyperlegible
  for body and UI text, Caveat only for the teacher's notes, the summary grade and its cheer. The
  root layout keeps the splash screen up until they load.
- **Game pieces** (original art, SVG drawn in code, all decorative and hidden from screen
  readers): `Sticker` (round, die-cut, tilted; `done` / `current` / `pending` dashed slot; can be
  slapped on once), `Avi` (`mascot.tsx`, the paper-plane mascot: happy, cheer, sleepy; can glide
  in once; never on an exercise), `ClipChainMark` (the streak, one clip per day up to five, new
  colors at 7, 30 and 100 days; `model/clip-chain.ts`), `XpBar` (every 250 XP fills a sheet of
  stickers; `model/xp-sheet.ts`), `Confetti` (hole-punch dots, deterministic, not rendered at all
  with reduced motion) and `PopBadge` (the "+10" sticker of a right answer).
- **Home** (`features/home/`): a progress card (clip chain and days, sound and account, the XP
  sheet, the link to the album with its count), the review sticky note (Avi naps when there is
  nothing to review), the placement invitation, then the level's lessons as a path drawn in
  pencil, grouped by topic: won lessons are tilted stickers with a check, the first lesson not done
  is a big yellow sticker where Avi lands ("Siguiente", hint "Tu siguiente lección"), the rest are
  numbered dashed slots. Nothing is locked.
- **Album** (`features/achievements/`, route `/album`): sixteen achievements derived from the
  stored progress only (lessons, whole topics, whole levels, the longest streak, XP, placement,
  words practiced; `model/achievements.ts`), so they need no storage and follow sync. Won ones are
  stickers (rare ones get a holographic rim), the others dashed slots that say how to win them.
  `useNewAchievements` compares what the progress unlocks when a lesson or review starts and once
  it is saved; the summary announces the difference.
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
- **Exercise progress**: one step per exercise, each answered step colored by its verdict (mint,
  yellow, coral) and the current one outlined in ink, with "Ejercicio 2 de 6" under it. The
  prompt sits on a ruled card.
- **Feedback band**: the pinned footer is tinted by the verdict (`ScreenContainer footerTone`),
  with a round mark and "¡Correcto!" / "¡Casi!" / "Incorrecto", the points as a `PopBadge`
  ("+10", "+5"), and "¡3 seguidas!" from three right answers in a row
  (`model/session-results.ts`). The marking below is unchanged.
- **Summary** (lesson and review): the session's sticker (the lesson topic's color, sky for a
  review) slapped on the page with Avi cheering and confetti, the teacher's cheer by accuracy
  ("¡Perfecto!", "¡Muy bien!", "¡Bien hecho!", "¡A seguir practicando!") and her red Caveat grade,
  a results card (aciertos, XP, streak with its clip chain), the stickers earned for the album,
  then "Para repasar": up to six missed items (wrong or almost) with their Spanish gloss
  (`model/items-to-review.ts`), or a short line when everything was right.
- **Sounds** (`src/infrastructure/sound/`): seven short sounds synthesized by
  `scripts/generate-sounds.mjs` (deterministic, no dependencies; `pnpm generate:sounds`
  rewrites `assets/sounds/*.wav`, 16-bit mono 44.1 kHz, -6 dBFS peak). `tap` when choosing an
  option or a word, `correct` / `almost` / `wrong` when feedback appears, `complete` when a
  lesson, review or placement result is saved, then `streak` when that session extended the
  streak, then `achievement` when it earned album stickers. Placement only taps (it gives no per-question feedback). Sounds are loaded once, never
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
- **Motion** (`motion.ts`, react-native-reanimated): motion explains what changed or rewards
  the learner, never decorates, and nothing moves on its own while an exercise waits for an answer;
  at most one orchestrated moment per screen, 150–350 ms (celebrations up to ≈ 1.4 s), only
  transforms and opacity, springs for physical things. `useReducedMotion` knows the system setting on the first render
  (Reanimated reads it at startup, `AccessibilityInfo` keeps it current); with it on, every
  animation below shows its end state at once.

  | Where                            | What                                                                                                                                                                                                          | Duration        |
  | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
  | Feedback, correct                | highlighter swipe over the answer (`Highlight animate`)                                                                                                                                                       | 250 ms          |
  | Feedback, wrong / almost         | red-pen strike drawn left → right over the off words, then the margin note fades/settles in                                                                                                                   | 250 ms + 150 ms |
  | Choice rows, buttons, index rows | press-in scale to 0.97 (`PressableScale`), no hover                                                                                                                                                           | 90 ms           |
  | Next exercise                    | page turn: the new page comes in from the right (`PageTurn`)                                                                                                                                                  | 220 ms          |
  | Word order                       | strips dragged from the bank to the line, reordered, or off it back to the bank; lift while dragging, spring settle, `tap` sound + light haptic on drop                                                       | spring          |
  | Feedback, points                 | the "+10" / "+5" sticker pops in with a bounce and settles a little higher; the answered progress step pops once                                                                                              | ≈ 650 / 250 ms  |
  | Summary                          | the sticker is slapped on, Avi glides in, confetti falls; perfect page: the stamp lands; XP counts up; a grown streak rolls and hooks a new clip; earned album stickers rise in, with the `achievement` sound | ≈ 1.4 s in all  |
  | Home path                        | a lesson completed since home was last seen gets its sticker slapped on and its check drawn once (`model/completion-memory.ts`); Avi glides to the next lesson                                                | ≈ 900 / 700 ms  |

  Pen strokes (highlighter, strike, check) share one hand: `usePenStroke` + `StrokeClip`, a
  clipped copy revealed left to right. Word order stays fully usable by tap, and placed words
  have screen-reader actions "Mover a la izquierda / derecha". Unit tests run with reduced
  motion on by default (`jest.setup.js`; `withMotion()` opts out); Reanimated, Worklets and
  Gesture Handler use their Jest mocks, and drag and drop is covered end to end on web.

- **Doodles** (`doodle.tsx`): pencil doodles for the placement intro and about. Original art, low
  contrast.
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
pnpm generate:icons  # rasterize assets/icon/icon.svg (Playwright Chromium) into assets/images/*.png
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
summary, the album, about and the "open in another tab" error screen. Every screen is captured at
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
- **One tab at a time on web.** Only one page can hold the database (see
  [One tab at a time](#one-tab-at-a-time-web)): a second tab or the installed app next to a tab
  offers "Usar aquí", which hands the database over and pauses the other page; answers of an
  unfinished session in the page that lets go are lost. Pages of an app version from before this
  check do not take part in it and still show "La app ya está abierta en otra pestaña.".
- **iOS / Safari PWA.** Installing is manual (Share → "Añadir a pantalla de inicio"); there is no
  install prompt. The home screen app has its own storage, separate from Safari's: progress made
  in the Safari tab does not carry over to the installed app. Safari may evict the data of a site
  not used for weeks (ITP); the installed app is exempt from that 7-day rule. Offline e2e runs in
  Playwright's WebKit, not on an iPhone: check Add to Home Screen and airplane mode on a device.
- **The first visit must be online and complete its precaching** (about 3.5 MB) before the app
  works offline; an update downloads only the files that changed.
- **No storage in private browsing on Safari / WebKit.** Without OPFS the database cannot open
  and the app shows "No pudimos abrir tus datos."
