# @english-learn/mobile

Expo (SDK 58) app shell: expo-router screens, SQLite persistence via `expo-sqlite`, and a static
web build. Offline-first: no network or AI at runtime. UI copy is neutral Spanish with tú
("puedes", "inicia"), never voseo ("podés", "iniciá"); `src/neutral-spanish.test.ts` scans `src/`
and `e2e/` with the content package's `findVoseo` and fails on the common voseo forms.

## Structure

| Path                  | Responsibility                                                                     |
| --------------------- | ---------------------------------------------------------------------------------- |
| `src/app/`            | Routes only (`/`, `/placement`, `/lesson/[id]`, `/review`, `/fichas`, `/about`, …) |
| `src/features/*`      | Feature screens; containers load data, views are pure (props only)                 |
| `src/infrastructure/` | Adapters: `SystemClock`, SQLite wiring, `AppServicesProvider` (DI)                 |
| `src/shared/ui/`      | Notebook design system: theme tokens, `useTheme`, UI primitives                    |
| `src/testing/`        | Test helpers (in-memory `ProgressRepository`)                                      |
| `e2e/`                | Playwright tests against the exported web build                                    |

Features read `ProgressRepository`, `SettingsRepository`, `Clock`, `random` (an `Rng`),
`randomBytes` (for event ids) and `sounds` (a `SoundPlayer`) from `useAppServices()`. The root
layout provides the SQLite-backed repositories (`@english-learn/storage-sqlite`, prepared in
`onInit` by `initProgressStore`), the system clock, `Math.random`, expo-crypto's
`getRandomValues` and the sound player (expo-audio on native, Web Audio on web); tests wrap
components in `<AppServicesProvider services={...}>` with in-memory fakes and deterministic
random sources.

### Progress is an event log

Progress is stored as the domain's append-only event log (`@english-learn/domain`, "Progress
event log"); the progress tables are a cache of its fold that every write refreshes (incrementally,
from a stored fold snapshot: see `@english-learn/storage-sqlite`), and reads
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
(`src/infrastructure/errors/`). If the database fails to open or migrate, the provider throws a
`DatabaseOpenError` while rendering and the boundary shows a message with "Reintentar" instead of
a blank screen; any other render error shows "Algo salió mal.". "Reintentar" reloads the page on
web (expo-sqlite's worker cannot reopen after a failed open) and opens again and remounts the
app on native.

**One database open per page (web).** expo-sqlite runs every database in one worker per page,
created on the first open; its OPFS VFS takes a sync access handle on each of its files, and a
file accepts only one. A second acquisition in the same page (a second open racing the first, a
second worker, the file probe older builds ran) fails, on WebKit with `InvalidStateError`. After
a failed open that worker never opens again (its VFS stays uninitialized). So the open runs once
per page at module level (`page-database.ts`): remounts, re-renders and boundary retries reuse it
and never start another worker, and only a reload opens again. `worker-count.ts` counts the
page's workers (exactly one, expo-sqlite's; `window.__e2e.dbWorkers` in e2e builds).

**Busy files retry by reloading (web, `open-retry.ts`).** A busy open (the previous page's worker
still letting go after a reload, a redirect return or an update; on iOS, stale handles in the
storage process, even right after a restart) reloads the page after 400, 800, 1600, 3000, 5000
and 5000 ms (15.8 s of delays, about 17–20 s with the reloads), showing "Abriendo tus datos…"
(static, no spinner) meanwhile, also on each reloaded page while it opens again. The count lives
in `sessionStorage` `english-learn-db-open-retries` and the round's start in
`english-learn-db-open-retries-since`, both cleared once the database opens or on "Reintentar".
Never with two workers in the page (that collision is the page's own: retrying would hide it) and
never without a working `sessionStorage` (it could loop). Then the message below, which keeps
trying on its own (`background-retry.ts`): every 15 s while visible and at once on
`visibilitychange` to visible, `pageshow` (bfcache restores too) and `focus`, one reload each,
without a fresh window; the app opens as soon as the files are free.

Why a reload and not a retry in place: expo-sqlite's worker (`web/worker.ts`,
`maybeInitAsync`) sets `_sqlite3` before `AccessHandlePoolVFS.create`; when that throws, later
opens skip the init and fail with "Invalid VFS state", and the handles the VFS did acquire before
the failing one (`Promise.all` in `#acquireAccessHandles`) stay open in that worker. The worker
is a private singleton of `SQLiteModule.ts` with no way to end it, so only a new page gets a
clean one. `location.reload()` adds no history entry (checked in `e2e/database-errors.spec.ts`).

**No in-memory fallback.** expo-sqlite's worker sets up the OPFS VFS and the in-memory one in the
same step: when OPFS acquisition fails, every later open in that page fails too, `:memory:`
included, and after a reload the same OPFS acquisition runs (and fails) first again. A "use
without saving" mode would need a patched expo-sqlite.

Messages by cause (`database-open-error.ts`):

- **The files are held** (web), when the ownership check below let the open go ahead: recognized
  by the messages browsers actually report (Chromium: "Access Handles cannot be created if there
  is another open Access Handle…"; WebKit: "The object is in an invalid state."). It does NOT
  claim another tab (on iOS this happens with no other tab at all): "No pudimos abrir tus datos
  en esta ventana." saying it keeps trying and will open by itself, steps to free them (close
  the app from the app switcher, close Safari tabs of the site, restart the iPhone if it
  persists: the proven fix) and "Detalles técnicos" (`open-failed:<code>`, the environment, the
  page's database workers, `Sondeo de archivos: no`, the automatic retries and `Espera total`).
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
   wait up to 6 s for the lock. Still taken and `navigator.locks.query()` shows a holder (or the
   query is missing) → the same screen (`lock-held`).
3. **Never the files**: the check does not touch the database files. Older builds probed them
   from a throwaway worker (open and close a sync access handle on each) right before SQLite
   opened them; on iOS the handles are released late, and SQLite's open then failed with
   `InvalidStateError` in the page itself (the iPhone's "No pudimos abrir tus datos en esta
   ventana.", reproduced in `e2e/database-errors.spec.ts` by delaying the release). Waiting for
   the previous page's worker to let go is the busy-open retry above.
4. **Only positive evidence claims another page**: an `owned` answer, or a lock another client
   holds. A Web Locks request that rejects, or a lock that is never granted although nobody holds
   it, go on to the normal open, which reports the real error. (On iOS Home Screen apps "busy"
   showed up with no other page alive, and "Usar aquí" looped forever.)
5. **"Usar aquí"** posts `release`. The owner refuses new writes and waits for the ones in flight
   (saves and the sync's, `createWriteTracker().drain()`), unmounts the app (stopping sync and its
   timers), replies `released` and reloads with a one-shot `sessionStorage` flag, so it shows
   "La app se abrió en otra pestaña" with its own "Usar aquí" (which takes the database back the
   same way). The new page then takes the lock as above.
6. **Never a silent loop**: presses are counted in `sessionStorage`
   (`english-learn-db-takeover-attempts`, cleared once the database opens). If the lock is still
   taken after "Usar aquí" (the holder never answered: frozen, suspended), or after a reload that
   follows a failed "Usar aquí", the page shows "No pudimos abrir tus datos en esta ventana." with
   iOS steps and "Reintentar", which asks again and waits up to 15 s for the lock.
7. **"Detalles técnicos"** (collapsed) on these screens: reason code (`owner-answered`,
   `lock-held`, `no-owner-answer`, `lock-acquired`, `no-locks`, `lock-error:<name>`, …),
   whether Web Locks / BroadcastChannel / OPFS exist, display mode (`standalone` / `browser`),
   lock holders, attempts and ISO timestamps. No personal data: meant for a screenshot.

Without Web Locks the channel still applies (`no-locks`). Native apps skip all of this.

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
- **"Lo nuevo de hoy"** (`model/lesson-recap.ts`): the lesson summary ends with the 3–5 items the
  lesson introduces (the content's `newItemIds`; without them, the lesson's items no earlier
  lesson practices). Each shows its term (with word lookup) and Spanish, then "Ver ficha:
  <título>" when a study card teaches it (opens `/fichas/[id]` on top of the summary), or else an
  example: the item's own `example`, or a sentence of an exercise that practices it, with its
  Spanish and linking the item's glossary entry (the lesson's exercises first). The card is the
  lesson's linked card (`deepenCardIds`) first: one that lists the item, or teaches its term or
  headword even under another item id ("look forward to + -ing" in "Una noche de cultura" opens
  "Look forward to + -ing"); else a card that lists the item. Terms are never matched against
  cards the lesson does not link. Card practice and the daily review have no recap.
- **"Repetir lección"** on the lesson summary (a secondary button with mistakes, a text button on
  a perfect page) runs the lesson again from the start as a new session (`LessonContainer`
  remounts the session with a new key): answer XP again, never a second completion bonus.

Home lists the lessons of the level nearest to the placement level that has lessons (ties go to
the lower level; with MVP content A1 → A2 and B2/C1 → B1), or A2 without a placement. A lesson
shows as done once every item it practices has a review state.

**Lesson results on the path.** A done lesson also shows its best result, from the fold's
`lessonResults` (the best `accuracy` of its `session_completed` events; no new event):
`model/lesson-score.ts` turns it into right answers out of the lesson's exercises (accuracy ×
exercises, rounded; anything below 1 is never shown as all right). Every answer right: "Perfecta
· 6/6" and a small yellow star sticker on its corner, labelled "<título>, completada sin errores:
6 de 6 correctas"; otherwise "Completada · 5/6", labelled "… completada con errores: 5 de 6
correctas" with the hint "Repítela para sacar todo bien" (texts in `model/lesson-score.ts`, the star
in `components/perfect-badge.tsx`, shared with study cards). The best attempt counts, so a perfect
redo makes it perfect for good. Lessons done before the event log (or only through other
lessons' items) have no result and keep "Completada". Tapping a done lesson redoes it.

**"Profundiza" under done lessons.** A done lesson with linked cards (`deepenCardIds`) shows one
small row per card under its stop: a loose index card with a dashed edge, "Profundiza", the card
title and its best result with the same marker as the path ("Perfecta · 6/6" with the star, or
"Completada · 5/7"; `cardScores`), or "Nueva" when the card was never practiced. It opens
`/fichas/[id]`; labelled "Profundiza: <título>, ficha nueva" or "Profundiza: <título>, completada
sin errores: 6 de 6 correctas", with the hint "Abre la ficha". Rows are 48 pt tall, smaller than
a stop (84), and the pencil line runs on beside them (solid or dotted, like the line between
stops) when another stop follows. Only the shared press feedback moves, and not with reduced
motion. Lessons not done yet show nothing.

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
  inside exercises, their feedback and the summary, and on a study card (see "Study cards"; never
  a pitfall's mistake); never Spanish text or UI copy. What the
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
states that some non-reading exercise covers (new items come from lessons only), items in their
first steps (interval ≤ 1 day: a lesson's new items the day after, and lapses) first, so a
backlog of older reviews never pushes them out of the 20.

**How lesson items enter review.** Nothing extra is written: a finished lesson's `item_reviewed`
events give each new item a state due the next day (`applyReview`: passed → SM-2 interval 1;
missed → fresh, due tomorrow), and the reviews then grow it (1 → 6 → interval × ease). Every
lesson item has a non-reading exercise (content rule 20), so none waits unreviewed; nine items
only a reading practiced got a review-only `vocab` exercise. For each due
item, in priority order, it picks one exercise that practices it, preferring a different type
than the previous pick, chosen with the injected rng; an exercise covering several due items
reviews all of them. Only the due items are saved (an exercise may also practice items that are
not due; those are untouched). XP is answer XP only, no completion bonus. Home shows a sticky note
"Repaso, N pendientes" (same plan) with a "Repasar" button, or "Nada para repasar hoy".

## Study cards, "Fichas" (`src/features/cards/`)

The cards of `@english-learn/content` (`corpus.cards`; see its README, "Study cards"), each a short
explanation with the items it teaches and 6–8 practice exercises that are in no lesson.

- **Home**: "Fichas · 28 fichas · 3 estudiadas" under "Mi álbum" opens `/fichas`.
- **`/fichas`**: the cards grouped by kind (Gramática, Phrasal verbs, Vocabulario: the topic
  labels and colors of `grammar`, `phrasal-verbs`, `vocabulary`), then by level. A card is
  **studied** once every item it lists has a review state, and **mastered** once all reached the
  mastery interval (`levelProgress`, 21 days); `model/card-catalog.ts`. A practiced card also
  shows its **best result**, the same marker as a done lesson on the path ("Perfecta · 6/6" with
  the star sticker, or "Completada · 5/6", and "…, completada sin errores: 6 de 6 correctas" in
  its label): `cardScores` reads the fold's `lessonResults` under the card's id (practice is saved
  as that lesson, so nothing new is stored) and counts over the card's exercises with
  `lessonScore`. Cards never practiced show nothing new.
- **`/fichas/[id]`**: kind, level and status; the summary; the form on a ruled card like a
  formula; "Cuándo se usa"; "Errores comunes" (the mistake struck in red pen and never a lookup,
  then the correction and why); phrasal verbs with a "separable" chip and the "turn it off" note;
  collocations and the false friend ("Parece: … / Significa: …"); examples with their Spanish.
  English words of corrections, examples, verbs and collocations can be looked up (no SRS signal:
  nothing is graded there). "Practicar" opens `/fichas/[id]/practicar`. Once practiced, the
  footer shows "Tu mejor resultado" (the same marker) and the button reads "Practicar de nuevo":
  a redo pays answer XP only, since the fold pays the completion bonus once per card id.
- **Practice** reuses the lesson session (`PracticeSession` in `lesson-container.tsx`: exercises,
  feedback, lookups and their grade cap, sounds, leave confirmation, summary "¡Práctica
  completada!" / "Volver a la ficha"). It is **saved as a lesson whose `lessonId` is the card id**
  (`session_completed` kind `lesson`): answer XP, the first-time completion bonus like any lesson,
  items into SRS like lesson items, and it folds the same on devices with older app versions (a
  new kind would be skipped there as invalid). This is safe because home, the album and the
  transfer preview count lessons from the content's lessons, never from `completedLessonIds`, and
  a test checks that no card id equals a lesson id.
- **Daily review** already plans over every corpus exercise, so due card items are reviewed with
  their card's exercises (tested with the real corpus).
- **"Ver ficha"**: after a wrong or almost answer in a lesson or review, when the exercise
  practices an item a card teaches (`cardByExerciseId`), the feedback offers a quiet "Ver ficha:
  <título>". It pushes `/fichas/[id]?volver=1` on top of the session (nothing is lost); that card
  offers "Volver al ejercicio" instead of "Practicar". Not offered while practicing the card.
- **Album**: "Primera ficha" (a card studied) and "Gramática al día" (every grammar card of a
  level studied), derived like the other stickers.

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
  `<origin>/auth/callback#id_token=…&state=…`.
- **`/auth/callback` never opens the database** (`callback-relay.ts`; the root layout renders it
  without `SqliteAppServicesProvider`). expo-sqlite keeps the OPFS files until its page dies, and
  on iOS a Home Screen app may load the callback in a second web view; a callback page holding
  the database would lock the real app window out. The page removes the fragment from history,
  stashes it in `localStorage` (`english-learn.auth-callback`, ≤ 10 min, read once) and asks on
  the BroadcastChannel `english-learn-auth` for the window that started this sign-in (the one
  whose `sessionStorage` has the pending `state`). That window answers and completes the sign-in
  itself (also when it comes back to the foreground later); the callback page says "Listo" and
  tries to close. Nobody answers (the usual same-tab redirect) → a full load of
  `/auth/completar`, which boots the app, checks `state` (once, ≤ 10 min old), sends
  `{ idToken, nonce }` to `POST /v1/auth/google` in cookie mode (the API checks the token's
  `nonce` claim) and `router.replace`s itself with home (`/`), so back never reopens the
  callback. Only a deletion that needed a fresh sign-in returns to `/cuenta?eliminada=1`, for
  its confirmation; the "save your progress" note just opens `/cuenta` and lands on home too.
- **Session** (`auth-session.ts`). Access token in memory only; the device remembers only
  `{ userId, email }` (`SettingsRepository.setAccount`). On start, with that marker, one refresh
  (cookie) restores the session; a 401 signs out, a network failure keeps the learner signed in.
  Refreshes are single-flight and serialized across tabs with `navigator.locks`
  (`english-learn-refresh`).
- **Sync** (`sync-engine.ts`, `sync-coordinator.ts`, `sync-triggers.ts`). Each `POST /v1/sync`
  uploads up to 500 unsynced events (and < 900 KB) and pulls the account's events after the
  cursor; it loops while events remain or `hasMore`, applies pulled events with
  `insertRemoteEvents` (incremental fold), marks uploads synced and stores the cursor after each page.
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

## Moving to the new web address (`src/features/transfer/`)

The web app moved from `https://english-learn-iwl.pages.dev` (old) to
`https://english.maumar.com.ar` (new); both serve the same build. Progress lives on the device per
origin, and the two cannot message each other (cross-origin isolated), so the API relays it once
([progress transfers](../../services/api/README.md#progress-transfers)).

- **Old address** (`OriginMoveGate`, right after the database opens, before any screen): with
  progress, home shows a sticker banner, "La app se mudó a english.maumar.com.ar", with
  **Llevar mi progreso** (uploads the whole log with `POST /v1/transfers`, remembers
  `migratedTo`, then opens `https://english.maumar.com.ar/importar#t=<token>`) and **Ir sin mi
  progreso**. Offline, 413 and 429 are explained, with a retry. Without progress, or once moved, it
  `location.replace`s itself with the same page (path and query, never the fragment, so a crafted
  old-address link cannot bounce a `#t=` token) on the new address. `/?transferir=1` offers the
  move again after an expired or used link. Nothing is deleted on the old address.
- **New address, `/importar`**: drops the fragment from the address bar, history and the router's
  `#` param first, then claims the transfer (`POST /v1/transfers/claim`, once) **into memory
  only** and previews it (folded on its own: XP, completed lessons, streak, dates, event count):
  "Progreso del sitio anterior … ¿Importarlo a este dispositivo?". Anyone can craft such a link,
  so nothing is written before **Importar**; then the events become this device's **unsynced**
  events (`importEvents`: idempotent by id, never marked synced), so a signed-in learner's next
  sync uploads them (the preview says so when signed in). **Cancelar** discards them and explains
  the link is spent. A failed save retries from memory without claiming again. An expired or used
  link explains itself and links back to the old address.
- The service worker serves `/importar` the app shell; the fragment never reaches a server.
- E2E (`e2e/transfer.spec.ts`): a second server of the export (`E2E_OLD_PORT`, default
  `E2E_PORT + 1`) plays the old address and a local fake plays the transfer API; the e2e build
  reads both addresses from `localStorage` (`english-learn.e2e.oldWebOrigin` / `newWebOrigin`).

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
  numbered dashed slots. Nothing is locked. Avi points along the pencil line that comes down to
  the next sticker (`model/guide-heading.ts`): from a stop on the left it faces right, nose
  tilted down, on the sticker's top left; from a stop on the right it is mirrored onto its top
  right (`Avi` `tilt` / `facing`; it glides in from the side it faces).
- **Album** (`features/achievements/`, route `/album`): eighteen achievements derived from the
  stored progress only (lessons, whole topics, whole levels, the longest streak, XP, placement,
  words practiced, study cards; `model/achievements.ts`), so they need no storage and follow sync. Won ones are
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
  ("¡Muy bien!", "¡Bien hecho!", "¡A seguir practicando!"; a perfect page gets her "¡Excelente!"
  stamp instead) and her red Caveat grade,
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
summary, the album, about, the "open in another tab" error screen, the Fichas list, a grammar,
a phrasal-verbs and a vocabulary (false friend) card, a card practice's feedback and a lesson's
wrong feedback with "Ver ficha" and the card it opens. Every screen is captured at
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
The update test starts its own server (`createStaticServer` with `serviceWorkerVersion`) on its
own origin, then bumps the version so `/sw.js` gets a comment appended for every request, which
the browser treats as a new deploy. It cannot key the deploy on a cookie: WebKit checks `sw.js`
again about a second after each navigation without sending cookies, so a cookie-keyed deploy
looked rolled back and was offered again after "Actualizar". Specs that write and reload at once call
`waitForServiceWorker` first so the first visit's precaching does not slow the write down.

First-time Playwright setup: `pnpm exec playwright install chromium webkit`. Every spec runs on
Chromium and on WebKit (Safari / iOS web). Specs import `test` from `e2e/support/test.ts`, which
runs each test in a fresh persistent browser profile: WebKit has no OPFS in Playwright's default
ephemeral contexts (like Safari Private Browsing), so expo-sqlite could not open the database
there. Playwright's WebKit also shares website data between profiles, so the webkit project runs
on one worker and each test first empties OPFS and removes service workers and their caches (from
`/metadata.json`, a static file: every navigation without a file now gets the SPA).

## Android builds

App identity lives in `app.json`: version `0.2.0`, `android.versionCode` `1` (increment it for
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
  standalone, paper `#F5F7FF` theme and background, 192/512 icons and a maskable 512). With
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
