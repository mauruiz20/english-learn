# @english-learn/mobile

Expo (SDK 58) app shell: expo-router screens, SQLite persistence via `expo-sqlite`, and a static
web build. Offline-first: no network or AI at runtime. UI copy is neutral Spanish with tú
("puedes", "inicia"), never voseo ("podés", "iniciá"); `src/neutral-spanish.test.ts` scans `src/`
and `e2e/` with the content package's `findVoseo` and fails on the common voseo forms.

## Structure

| Path                  | Responsibility                                                                        |
| --------------------- | ------------------------------------------------------------------------------------- |
| `src/app/`            | Routes only (`/`, `/placement`, `/lesson/[id]`, `/review`, `/fichas`, `/practica`, …) |
| `src/features/*`      | Feature screens; containers load data, views are pure (props only)                    |
| `src/infrastructure/` | Adapters: `SystemClock`, SQLite wiring, `AppServicesProvider` (DI)                    |
| `src/shared/ui/`      | Notebook design system: theme tokens, `useTheme`, UI primitives                       |
| `src/testing/`        | Test helpers (in-memory `ProgressRepository`)                                         |
| `e2e/`                | Playwright tests against the exported web build                                       |

Features read `ProgressRepository`, `SettingsRepository`, `Clock`, `random` (an `Rng`),
`randomBytes` (for event ids), `sounds` (a `SoundPlayer`) and the optional `speech` (a
`SpeechService`, see "Pronunciation") from `useAppServices()`. The root
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
  `session_completed` (with `exercises`, the number answered, for the daily goal), sharing a
  session id and the save's `today`;
- a finished placement test → `placement_completed`.

Avi's withdrawn wardrobe wrote `item_purchased` / `item_equipped`; logs and other devices may
still hold them, and the fold ignores them (`@english-learn/domain`, "Retired types").

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

**Leaving the page lets go of the database (web, `page-release.ts`, `app-page-release.ts`).**
expo-sqlite's `AccessHandlePoolVFS` takes a sync access handle on every file of its pool when its
worker starts and keeps them for the worker's lifetime: closing the database releases none. iOS
keeps a page that navigated away in its back/forward cache with that worker alive. On the owner's
iPhone (Home Screen app), after sign-out and a new Google sign-in, every page showed "No pudimos
abrir tus datos en esta ventana." (`open-failed:InvalidStateError`, one worker, no probe) until a
reboot; pressing Back, which restored the page that had redirected to Google, made the app work
at once. So:

- Every navigation or reload the app makes on purpose goes through `leavePage`: the Google
  redirect (sign-in, the deletion's re-authentication), "Actualizar" (update banner), the
  busy-open retry reloads and their background retry, "Reintentar", the old address's move
  (`location.replace` / `assign`), the import screen's link back, and "Volver a la pantalla
  anterior". It finishes the writes in flight and refuses new ones (`createWriteTracker().drain()`,
  at most 2 s), asks expo-sqlite's worker to close every database and every handle of the pool and
  waits for its answer (at most 1.5 s), ends the worker (`terminate`, which also frees handles of
  an open that failed halfway) and lets go of the owner Web Lock; then it navigates.
  `/auth/callback` never opens the database, so its redirect needs none of this. Sign-out does
  not navigate.
- "Usar aquí" on another tab does the same before answering `released`.
- `pagehide` (which cannot wait) ends the worker and lets go of the lock at once, for navigations
  the app did not start (a link, the browser's Back). A page restored from the back/forward cache
  (`pageshow` with `persisted`) that let go of its database reloads: that is how it opens again.
- Not by making the page ineligible for the back/forward cache: navigations are answered by the
  service worker from its precache, so a `Cache-Control: no-store` in `_headers` would not even
  reach the page, and nothing shows that WebKit keeps such pages out of its cache. The release
  works whether or not the page is cached.
- The worker message is this app's patch of expo-sqlite (`patches/expo-sqlite@58.0.14.patch`,
  `pnpm patch`): `releaseAccessHandles` closes every session, statement and database, calls
  `AccessHandlePoolVFS.close()` (which closes every sync access handle) and answers
  `accessHandlesReleased`; afterwards that worker refuses to open anything (it would take the
  files again). The page reaches the worker through `countWorkers` (expo-sqlite keeps it private).
- The busy-files screen offers "Volver a la pantalla anterior" when the Navigation API shows an
  earlier entry of this window on the app's own address (`back-to-previous-screen.ts`): it may be
  a page frozen by an older build, or by a navigation the app did not start, still holding the
  files, and restoring it is what freed them on the iPhone. Only a button, never automatic: going
  back leaves the current screen, and when that entry is not the holder it just loads normally
  (and may show the same screen). Never offered for another site or without the Navigation API.
- E2E (`e2e/back-forward-cache.spec.ts`): Playwright's browsers never keep these pages cached, so
  `e2e/support/back-forward-cache.ts` freezes an armed page instead of navigating (timers,
  channels and `fetch` stop, its Web Locks are let go, its workers keep their handles) and
  continues the navigation in a new page.

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
so only one page can hold the database. Closing the database does not release them (only the
release before leaving does, see above), and after a failed open expo-sqlite's worker cannot open
again until the page reloads. So the database opens
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
   (saves and the sync's, `createWriteTracker().drain()`), closes the files and ends the worker
   (see "Leaving the page" above), unmounts the app (stopping sync and its timers), replies `released` and reloads with a one-shot `sessionStorage` flag, so it shows
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
- **"Antes de empezar"** (`model/lesson-intro.ts`, `components/lesson-intro.tsx`): a path lesson
  with an intro opens on a short theory screen, one phone screen tall: the lesson title (in its
  topic's highlighter), the points, the examples (English with its `SpeakButton`, then the
  Spanish) and the typical mistake as ✗ wrong (struck in red pen) → ✓ right with its note, then
  "Empezar" pinned at the bottom. The intro is the lesson's own `intro`, or else one derived from
  its first linked card (`deepenCardIds`): the card's first three uses as points, its first
  example and its first pitfall. Lessons with neither, practice lessons and dialogues show none.
  On a redo, or when the lesson is already done (every item it practices has a review state, read
  once when the screen opens; "Cargando la lección" meanwhile), the intro is not a screen but a
  small "Repasar la teoría" toggle above the first exercise that opens it in place (44 pt,
  `aria-expanded`). The summary offers "Ver teoría" (a text button after the recap), which
  reopens the intro with "Volver al resumen". Plain text: no word lookups (they would cap the
  grade of the lesson's items). Nothing animates.
- **"Repetir lección"** on the lesson summary (a secondary button with mistakes, a text button on
  a perfect page) runs the lesson again from the start as a new session (`LessonContainer`
  remounts the session with a new key): answer XP again, never a second completion bonus.

Home lists the lessons of one level, the path's level (`autoPathLevel` in
`model/lesson-catalog.ts`). It starts at the level nearest to the placement level that has lessons
(ties go to the lower level: with no C1 lessons, C1 would map to B2), or A2 without a placement. The
placement test estimates A1 to C1 (there is no C2 level; its top result is C1), and A1 and C1
learners start on their own level once it has lessons. If the learner started the nearest lower
level with lessons (at least one lesson done) and has not finished it, the path starts there
instead: progress counts more than a newer placement or new content (until B2 had lessons, a B2
or C1 placement started on B1, so those learners stay on the B1 they began). Otherwise, if they
did nothing of the start level but started the next level up, the path starts there (until A1
had lessons, an A1 placement started on A2, so those learners stay on the A2 they began). From
that start the path moves up past every finished level to the first one with lessons left
(A1 → A2 → B1 → B2 → C1); with every level done it stays on the last one. A new learner is never
placed below the placement level. The learner can also pick the level by
hand (see "Path level, picked by hand" below). A lesson shows as done once every item it practices
has a review state.

**Path level, picked by hand.** Under "Lecciones de nivel B1" a chip says which level the path
shows and how: "Nivel B1 · automático" or "Nivel B1 · elegido" (labelled "Nivel del recorrido: B1,
automático" / "…, elegido a mano", hint "Muestra los niveles para elegir cuál ver"; 44 pt tall, ink
on the sheet). It opens a short list of radios right under it (`path-level-picker.tsx`):
"Automático · ahora B1" and every level with lessons with its progress ("B2 · 0 % completado"),
from `pathLevels`: a level shows up once the content has lessons for it (C1 as soon as its
lessons are bundled, with no app change).
Picking one closes the list and shows that level's path; a level picked by hand stays even once
every lesson of it is done, and "Automático" goes back to the rule above. Nothing animates but the
shared press feedback. The choice is a view preference, not progress: no event, stored on the
device (`SettingsRepository.getPathLevel` / `setPathLevel`, null = automatic; an unreadable
value reads as automatic) and forgotten with the progress on a sign-out that deletes it
(`clearPathLevel`). The next lesson, "Siguiente" and Avi on the path follow the level shown.
Showing another level never draws checks again: the completion memory remembers the done lessons
of every level.

**Level intros.** The first time the path shows a level on this device (its own level, or one
picked by hand), a dashed note above its first lesson shows the level's intro
(`data/<level>/level.json`): its title, "Al terminar este nivel podrás…" with the can-do list,
and its topics, with "Entendido" to close it. It is remembered as seen at once
(`SettingsRepository.getSeenLevelIntros` / `markLevelIntroSeen`, device only, no event), so it
shows once; it also closes when home loses focus. "Qué aprenderás en el nivel A2", a text button
under the path's heading, reopens it. A full sign-out that deletes the progress forgets the seen
levels (`clearSeenLevelIntros`), like the path level. A level without a `level.json` shows
neither.

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
stops) when another stop follows. A card shows once on the path, under the earliest done lesson
that links it (`model/deepen-steps.ts`), even if content links it from lessons of two topics. The
title wraps, never the marker: when both don't fit on one line the marker goes under the title,
and on a narrow phone the cards take the room right of the pencil line. Only the shared press feedback moves, and not with reduced
motion. Lessons not done yet show nothing.

**Topic names and colors** (`src/features/topics/`). A lesson's `topic` slug gets its Spanish
name from `topic-labels.ts` and its highlighter from `topic-colors.ts`, both keyed by slug, by
hand. Tests fail if a bundled topic has no name (the slug fallback, "New topic") or no color, or
if two neighboring topics of a level's index share a color. Content files have no topic title,
so names live in the app; the C1 topics were listed ahead of their lessons, so the C1 content
merged without app changes. In index (file) order:

| C1 topic slug                | Name                    | Color  |
| ---------------------------- | ----------------------- | ------ |
| `arts-and-culture`           | Arte y cultura          | pink   |
| `global-issues`              | Problemas globales      | green  |
| `language-and-communication` | Lenguaje y comunicación | sky    |
| `law-and-ethics`             | Derecho y ética         | orange |
| `politics-and-media`         | Política y medios       | lilac  |
| `psychology-and-behaviour`   | Psicología y conducta   | green  |
| `science-and-society`        | Ciencia y sociedad      | sky    |
| `work-and-negotiation`       | Trabajo y negociación   | orange |

C1 lessons must use exactly these slugs (ids `c1.<slug>.…`); a C1 topic outside this list needs
its name and color added here. If the C1 files sort in another order, check the neighbor-color
test.

## Delayed A1 checkpoint (`src/features/checkpoint/`)

The A1 home path links to `/comprobacion`, a three-question pilot about introducing yourself.
It opens 24 elapsed hours after the first recorded completion of `a1.greetings.lesson-002`
("¿Cómo te llamas?"). A redo does not restart that delay. The home entry and direct route both
check stored evidence; a pre-event baseline without a timestamp offers the source lesson instead.

Questions are held outside the ordinary corpus, use the existing deterministic grader, and
record one `checkpoint_completed` event with score/date only. Saving rechecks eligibility and
guards duplicate submission; a failed save can be retried. The separate summary and home entry
show the result without calling it retained knowledge or CEFR proficiency. Checkpoints do not
change XP, streak, daily goal, SRS or lesson completion. Later practice stays in the usual review.

The pilot is offline and results use the existing event log and optional account sync. Unit
tests cover the time boundary, direct route, save/retry and result persistence;
`e2e/checkpoint.spec.ts` covers the learner flow in the exported web app.

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

## Pronunciation (`src/features/pronunciation/`, `src/infrastructure/speech/`)

Learners hear English with the device's own speech synthesis: no recordings, no network.

- **Speech service** (`web-speech-service.ts`, over `window.speechSynthesis`; `device-speech.web.ts`
  wires it, `device-speech.ts` makes native unsupported since expo-speech is not a dependency).
  `speak(text, { rate, key, voice? })` stops whatever was being said first, queues long texts in
  sentence chunks (≤ 200 characters) and publishes `{ available, speakingKey, voices, voiceId }`
  for `useSyncExternalStore`. It never throws or blocks.
- **Voice** (`voice-choice.ts`, `rankEnglishVoices` / `pickEnglishVoice`): only English voices on
  the device (`localService`; a network voice would send the text to a server). Never Apple's
  novelty voices (Albert, Bad News, Bahh, Bells, Boing, Bubbles, Cellos, Good News, Jester,
  Organ, Superstar, Trinoids, Whisper, Wobble, Zarvox; matched by name and by their
  `com.apple.speech.synthesis.voice.*` URI, which keeps old ids such as `Hysterical` for Jester)
  nor Eloquence voices (Eddy, Flo, Grandma, Grandpa, Reed, Rocko, Sandy, Shelley;
  `com.apple.eloquence.*`). iOS 17+ lists all of them as ordinary local en-US voices and WebKit
  marks every voice `default`, so the old "default, then name" order picked "Albert" on an
  iPhone. Ranking: Premium (URI or name), then Enhanced / Neural / Natural / Siri, then known good
  voices (Samantha, Ava, Allison, Susan, Tom, Alex, Nicky, Zoe, Evan, Nathan, Joelle), then the
  system default for en-US (only where `default` means something, i.e. not WebKit), then other
  en-US, then other English, and the old compact Fred, Junior, Kathy and Ralph last; `en-US` first
  within a tier, a super-compact voice after its compact one, then name and URI, so it is
  deterministic.
- **WebKit / iOS**: voices arrive late, so it listens to `voiceschanged` and also looks again
  after 0.25, 1 and 3 s; the first tap anywhere (`pointerdown` / `touchend` / `keydown`) speaks
  one empty, silent utterance to unlock the engine and reads the voices again; `speak` runs
  inside the tap (iOS speaks only from a gesture; nothing autoplays). An idle engine is never
  cancelled (the text is spoken at once, inside the tap); a busy one is cancelled and the text
  spoken 100 ms later (`CANCEL_SETTLE_MS`) with fresh utterances: before Safari 27, WebKit's late
  `cancel()` callback could drop the utterances queued right after it
  ([bug 191745](https://bugs.webkit.org/show_bug.cgi?id=191745)). Hiding the page
  (`visibilitychange`, `pagehide`) cancels, since iOS stops without an end event; a watchdog
  clears a speaking state whose end never comes; a paused engine is resumed first.
- **Speed**: normal 1.0, slow 0.7 (`SPEECH_RATES`); "Más lento" is one step below the learner's
  speed (`SLOWER_RATES`: 0.7, or 0.5 when the learner picked "Lenta"). WebKit maps a rate below 1
  linearly onto `AVSpeechUtterance.rate` (`rate × AVSpeechUtteranceDefaultSpeechRate`), like
  Chrome, so iOS needs no different values.
- **Speaker button** (`SpeakButton`, `WithSpeaker`): 44 pt, a pen-drawn speaker, labelled
  "Escuchar: <texto>" (a passage: "Escuchar el texto"). Every tap plays at the learner's speed.
  There is no hidden second-tap toggle any more: it alternated with the other speed, so with
  "Lenta" every second tap played faster. While it speaks it is filled with ink (a state change,
  no animation, so reduced motion needs nothing); no press click (the voice is the feedback).
  Hidden when pronunciation is off, the device has no English voice, or there is nothing to say.
  Where: the word lookup card (dialog only: a hover tooltip cannot be pressed; the headword
  without notation, `speakableTerm`), "Lo nuevo de hoy" (each term and example), study cards
  (examples, collocations, corrections but never the mistake, phrasal verbs and the false
  friend), the feedback's right answer (`spokenAnswer`: the sentence, the cloze sentence filled,
  the English sentence of a translation choice, an English vocab answer; none for reading) and the
  reading passage (one speaker for title and text).
- **Settings** (`PronunciationProvider`, `PronunciationSettingsButton`): a speech bubble next to
  the sound switch (home, the exercise headers and the study card's) opens "Pronunciación" with
  an on/off switch (on by default), "Velocidad de la voz" (Normal / Lenta) and "Voz":
  "Automática (<best voice>)" (the ranking above, the default) or one of the device's English
  voices, best first, each with a "Probar" button that says a short sample with it at the
  learner's speed without picking it. A picked voice that is not on the device falls back to the
  automatic one. Stored in SQLite on the device (`SettingsRepository.getPronunciationEnabled` /
  `getSpeechRate` / `getSpeechVoice`, the voice's `voiceURI`); turning it off stops any speech.
  Not shown at all without an English voice.

### Listening in reviews (`features/lesson/model/listen-exercise.ts`)

"Escucha y escribe" (dictation) and "Escucha y elige" are derived, never authored: from a
word_order sentence or a translate_write reference answer of 3–14 words without digits (digits
are spoken as words). The sentence is never shown before the check; two explicit buttons play
it, each always at its own speed however often it is tapped: "Escuchar" (a speaker, the
learner's speed) and "Más lento" (a tortoise sticker, one step slower: 0.7, or 0.5 with
"Lenta"). A dictation is matched like translate-write against every sentence the source accepts
(case, punctuation and contractions tolerated, a typo is "almost"); a choice offers the sentence
and two others of the same level and length (from word_order sentences, translate_write answers
and card examples).

- **Reviews only, as stand-ins.** `mixListening` replaces up to two of the planned exercises
  (one in reviews under 6 exercises; never the first) with listening made from them, the first a
  dictation, the second a choice, picked with the day's own rng (`listeningRng(today)`), and only
  when an English voice exists and pronunciation is on (decided once the stored switch is read).
  The listening exercise keeps its source's `itemIds`, so each due item is still practiced exactly
  once, graded like any exercise (expected time 20 s), and the review keeps the count home showed
  ("Repaso, N pendientes" = "Ejercicio 1 de N"). Its id is `<source id>~listen`; the study card
  and topic come from the source; it cannot be marked "también es correcta" (disputes name real
  content ids).
- **Not in lessons**: a lesson's result is its best accuracy times its content exercise count
  ("Perfecta · 6/6"), and its first completion pays a bonus; an extra or swapped exercise would
  change that count's meaning and the items a lesson introduces. Reviews keep no per-lesson
  result, so a stand-in changes nothing but the presentation.
- If the voice goes away mid-review (switch turned off), the exercise shows its sentence instead
  of the play buttons, so it can still be answered.
- E2E (`e2e/pronunciation.spec.ts`): `e2e/support/speech-stub.ts` replaces `speechSynthesis`
  (voices loaded late, a network and a Spanish voice besides the local English one) and logs what
  was said. `answerCorrectly` also answers listening exercises (from their source's sentence), so
  other specs pass whether the browser has English voices or not.

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
not due; those are untouched). XP is answer XP only, no completion bonus. With pronunciation on
and an English voice, up to two of the planned exercises are heard instead of read (see
"Listening in reviews" under "Pronunciation").

**Home counts exactly what the review serves** (`planReview`, `reviewOutlook` in
`model/review-plan.ts`). The exercises are picked with the day's rng (`reviewPlanRng(today)`,
seeded by the date), so home and `/review` plan the same session from the same states. Home shows
a sticky note "Repaso, N pendientes" where N is the next review's number of EXERCISES (what
"Ejercicio 1 de N" shows; one exercise may review several due items), plus "y M más después" when
more is due today than one review holds (M: what the later reviews of the day will serve; a
reviewed item is never due again the same day), with a "Repasar" button. A maximum of 20 actual
review exercises can be completed per local date across sessions and app restarts. Lessons do not
use that allowance; due review items beyond it stay unchanged until tomorrow. Home and `/review`
read completed review counts from the event log, and the summary says "El resto queda para
mañana." when there is deferred backlog. Older review events without an exercise count reserve the full
20-exercise allowance for that date. Before this limit, home counted due ITEMS capped at 20: after
a 20-item review with a big backlog it still said "20 pendientes" (it looked unsaved) and the
review then served 18 exercises.

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

## Práctica libre (`src/features/practice/`)

Free practice by topic, apart from the path and its levels (content: `corpus.practice`, see
`@english-learn/content`, "Práctica libre"). Nothing is locked; a group's level is a label.

- **Home**: "Práctica libre · Gramática, Phrasal verbs, Situaciones, Tiempos verbales, a tu ritmo"
  (the collection titles) under "Fichas" in the progress card
  (secondary to the path), shown when the content has collections. It opens `/practica`.
- **`/practica`**: one card per collection ("Phrasal verbs: 10 grupos, 30 lecciones, 2 hechas")
  and a line saying it does not change the path and that new words come back in reviews.
- **`/practica/[collection]`**: the groups in order, each with its title, its level chip, its
  summary and its verbs (the item terms of its first lesson, with the object's place:
  `clean (something) up`), then its 2–3 lessons. A lesson row shows "Nueva" or its best result
  with the path's marker ("Perfecta · 7/7" with the star, "Completada · 5/7" with the hint
  "Repítela para sacar todo bien"), labelled "<título>, nueva" or "<título>, completada sin
  errores: 7 de 7 correctas". Rows are ≥ 56 pt; only the shared press feedback moves.
- **Lessons** play on `/lesson/[id]` (`LessonContainer` finds practice lessons in
  `practiceLessonsById`): the same exercises, feedback, lookups, sounds, summary with XP,
  "Lo nuevo de hoy" (cards linked with `deepenCardIds`) and "Repetir lección". They are
  saved as lessons with their own id (`session_completed` kind `lesson`; no new event, no fold
  change), so the fold pays the completion bonus once per lesson id, and their items enter spaced repetition like any lesson's. The summary
  button reads "Volver a Phrasal verbs" and goes back to the collection.
- **Never path progress**: the corpus keeps practice lessons out of `lessons`, and content rule
  24 keeps their items apart from the path's, so home, the next lesson, the level move, the album
  and the transfer preview count exactly what they counted before
  (`practice-path-separation.test.tsx` completes every practice lesson and compares the path).

## Diálogos (`src/features/dialogues/`)

Branching conversations, the "Diálogos" collection of Práctica libre (content:
`corpus.dialogues`; see `@english-learn/content`, "Diálogos").

- **List**: `/practica/dialogues` shows the groups with their dialogues, "Nuevo" or the best
  result in the masculine ("Perfecto · 6/6", "Completado · 5/6"; labelled "…, completado sin
  errores: 6 de 6 respuestas buenas"). The collection card counts "7 grupos · 25 diálogos".
- **Runner** (`model/dialogue-runner.ts`, pure): `startDialogue(dialogue, rng)` shuffles every
  choose turn once; `dialogueReducer` handles `begin` (the NPC lines up to the first turn),
  `choose` (by the reply's text), `write` (graded like translate-write with `matchAnswer` over the
  answer patterns, ignoring commas: correct → good, almost → ok, wrong → wrong and the turn's
  `wrongNext`), `continue` (the reaction of the branch taken) and `lookup` (grade cap, like
  lessons). Feedback carries the reply's Spanish explanation, "Mejor: …" (the turn's first good
  reply or the model answer) and a write turn's tip. An `end` finishes it with good replies out of
  the turns.
- **Screen** `/dialogo/[id]` (`dialogue-container.tsx`, `dialogue-view.tsx`): an intro (setting,
  characters, "Empezar"); then a chat on notebook paper: the character's lines on paper slips at
  the left (name, English with word lookup, a speaker, "Ver en español"), the learner's replies on
  the right tinted by rating, the replies to choose or a Spanish prompt to answer in writing; the
  feedback band ("¡Bien dicho!", "Se puede mejorar", "No del todo") with "Mejor: …" and its
  speaker; the page follows the end of the chat (`ScreenContainer followEnd`). The summary is the
  lessons' (`SessionSummary` with `header`, `correctLabel` and `redoLabel`): how it ended, "Tu
  mejor resultado" (read back from the fold after the save), "Respuestas buenas: 5 de 6", XP,
  streak, "Para repasar", "Lo nuevo de hoy" (the turns' items with the reply that used them, and
  the linked cards) and "Repetir diálogo". Leaving mid-dialogue asks first.
- **Read aloud** (intro switch, off by default, only with pronunciation available): the new
  character lines are spoken inside the learner's tap ("Empezar", "Continuar"), never on their
  own (iOS speaks only from a gesture).
- **Saving**: `completeSession` with `kind: "lesson"` and the dialogue id as `lessonId`, so the
  fold pays the completion bonus once per dialogue and keeps its best accuracy; each turn's
  `itemIds` get an `item_reviewed` with the reply's grade (choose as a translation choice, write
  as translate-write). No new event, no fold change.

## Daily goal (`src/features/daily-goal/`)

The learner picks how many exercises to answer per day: "Suave · 10", "Normal · 20" (the
default), "Intensa · 40" or "Sin meta" (`DailyGoal` in `@english-learn/domain`, "Daily goal"). It
complements the streak and never pressures: no notification, no reminder, no loss; missing it
changes nothing else.

- **The count** is the fold's per-day exercises (`ProgressRepository.getDailyExercises`, read for
  `clock.today()` with `exercisesOn`): every exercise answered in a lesson, review, card practice,
  Práctica libre, dialogue (one per turn) or hard-words practice, since they all save through
  `completeSession`, which writes `exercises` (the session's verdicts). A session counts on the
  day it is saved (the date its events carry), so each day starts from zero. Sessions saved before
  this version carry no count.
- **Where it is stored**: a device setting (`SettingsRepository.getDailyGoal` /
  `setDailyGoal`, `daily_goal`; unreadable → "Normal · 20"), not progress, so it does not sync.
- **Home**: in the progress card, under the streak, `DailyGoalMeter`: a ring (`goal-ring.tsx`,
  ink over a pale rule; a met goal is a full yellow ring with a check) with "Meta diaria" and
  "12 / 20 hoy", read as one progress bar "Meta diaria: 12 de 20 ejercicios hoy". Met: "¡Meta
  cumplida!" and a small yellow star sticker (labelled "¡Meta cumplida! 22 de 20 ejercicios hoy").
  Beside it a chip ("Normal · 20", 44 pt, labelled "Meta diaria: Normal · 20") opens the four
  goals as radios right under it; picking one stores it and closes the list. With "Sin meta" only
  the chip stays ("Meta diaria: Sin meta"). Nothing animates.
- **First time**: under the progress card, a dashed note "¿Cuánto quieres practicar cada día?"
  offers the four goals as buttons and "Ahora no" (`DailyGoalPrompt`). It blocks nothing (the
  default goal already counts); answering or closing it stores
  `setDailyGoalPromptDismissed()` and it never shows again. Picking on the chip answers it too.
- **Avi on home** cheers once the goal is met since home was last seen (see "Avi on home":
  `celebrate`, "¡Meta cumplida!", the hop; a finished lesson or new badge keeps "¡Lo lograste!").
- **Session summaries** (lesson, review, card practice, Práctica libre, dialogue, hard-words
  practice): one more line in the results card, "Meta diaria: 18 / 20" with a small ring, or
  "¡Cumpliste tu meta de hoy!" once met; none with "Sin meta". The count is read back after the
  save; if that read fails the line is left out (the save itself never fails over it).

## Tu progreso and "Mis palabras difíciles" (`src/features/hard-words/`)

Built on the SRS data the fold already has: review states plus each item's answer history
(`ProgressRepository.getItemHistories()`; buckets and score are the domain's `difficulty`
module, see `@english-learn/domain`, "Difficulty").

- **Home**: "Tu progreso · Dominadas, en proceso y difíciles", last row of the progress card
  (after Práctica libre), opens `/progreso`.
- **`/progreso`** (`ProgressContainer`, reloaded on focus): the reviewed words the content knows
  in three buckets, **Dominadas / En proceso / Difíciles**, as one bar split in proportion (ink
  outline and a 2 pt paper gap between segments, so it stands out in both themes; static, so
  reduced motion needs nothing) with each count written in its legend (color is never the only
  cue; the bar's label reads "13 palabras: 4 dominadas, 7 en proceso, 2 difíciles"). Then "Mis
  palabras difíciles", hardest first: term, Spanish, "Olvidada N veces · X % de aciertos
  recientes", a `SpeakButton` (the term without notation, hidden without a voice) and "Ver ficha:
  <título>" when a card teaches it. "Practicar mis palabras difíciles" shows when some
  non-reading exercise practices them.
- **`/progreso/practicar`** (`HardPracticeContainer`): up to 10 exercises over the difficult
  items, hardest first, picked with the review's `pickReviewExercises` (one exercise per item,
  varied types; the injected rng), played with the review screen and saved **like a review**
  (`session_completed` kind `review`, answer XP only, streak; no new event, no new XP rule).
  It saves the difficult items its exercises cover; other items an exercise also practices are
  left untouched, as in the review.
- **Scheduling of words that are not due**: every practiced difficult word gets its
  `item_reviewed`, and the fold's existing `applyReview` decides: a due word is reviewed (SM-2
  moves it ahead); a word not due yet that is answered right keeps its state and due date
  (practice must not inflate intervals: SM-2 grows them from recall at the scheduled time), but
  the answer enters its history, so it can leave Difíciles; a word not due that is missed again
  lapses (due tomorrow), exactly like a lesson replay. Home's count stays the next review's size,
  since home and `/review` still plan from the same states (`reviewOutlook`).
- **Summary**: "¡Práctica completada!", the results and "N de M palabras salieron de
  Difíciles." (practiced difficult words that are no longer difficult, compared before/after,
  whether they went to En proceso or Dominadas),
  then "Volver a mi progreso".

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
  `{ userId, email, givenName? }` (`SettingsRepository.setAccount`). `givenName` is the ID
  token's `given_name` (or the first word of `name`; `givenNameFromIdToken` in `oidc.ts`), read on
  the client at each sign-in for the home greeting: never sent to or stored by the API, replaced
  by the next account's sign-in, gone on sign-out. A refresh carries no ID token, so a marker
  from before names has none until the next sign-in. On start, with that marker, one refresh
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
  topics fall back to a stable hash; see "Topic names and colors" below), used for the topic labels and won stickers on the home
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
  slapped on once), `Avi` (`mascot.tsx`, the paper-plane mascot: happy, cheer, sleepy, sad; can glide
  in once and blink; never on an exercise), `ClipChainMark` (the streak, one clip per day up to five, new
  colors at 7, 30 and 100 days; `model/clip-chain.ts`), `XpBar` (every 250 XP fills a sheet of
  stickers; `model/xp-sheet.ts`), `Confetti` (hole-punch dots, deterministic, not rendered at all
  with reduced motion) and `PopBadge` (the "+10" sticker of a right answer).
- **Home** (`features/home/`): the greeting first (`home-greeting.tsx`): "Hola, <nombre>" with
  the signed-in learner's first name, or "¡Hola!" (signed out, or no name remembered yet); a
  heading in ink (AA in both schemes), one line with an ellipsis for long names. Beside it, **Avi
  on home** (`home-avi.tsx`, `model/home-avi.ts`; `docs/design/avi-rewards.md`, section 5 and
  "Slice 3 as built"): Avi at 76 pt (96 pt on wide screens) on the right, mirrored to face the
  page, with one line in a speech bubble under the heading. Avi is decorative (hidden from
  screen readers, not a button); the bubble carries the state and is a polite live region.
  `homeAviState` picks the state on each home focus, first match wins: celebrate ("¡Lo
  lograste!", a lesson done or a new badge since home was last seen; "¡Meta cumplida!" when only
  the daily goal was met since then), missed you (sad, "Te extrañé. Hoy empezamos una racha nueva.", the streak broke and nothing was
  studied today; no numbers), welcome back ("¡Qué bueno verte!", first visit of a
  new day, from `SettingsRepository.getLastHomeVisit`, per device), resting (sleepy, "Todo listo
  por hoy." when today's study is done and nothing is due, or "Ya es tarde. ¡Que descanses!" from
  22:00 to 05:59) and idle ("¡Hola! Soy Avi. ¿Empezamos?" for a fresh learner, "¿Repasamos un
  poco?" with reviews due, otherwise quiet). What is new is kept in memory for the app session
  (`createHomeAviMemory`, like the completion memory), so a reload celebrates nothing. Then
  a progress card (clip chain and days, sound and account, the daily goal, the XP
  sheet, the link to the album with its count; see "Daily goal"), the one-time daily goal note, the review sticky note (Avi naps when there is
  nothing to review), the placement invitation, then the level's lessons as a path drawn in
  pencil, grouped by topic: won lessons are tilted stickers with a check, the first lesson not done
  is a big yellow sticker where Avi lands ("Siguiente", hint "Tu siguiente lección"), the rest are
  numbered dashed slots. Nothing is locked. Avi points along the pencil line that comes down to
  the next sticker (`model/guide-heading.ts`): from a stop on the left it faces right, nose
  tilted down, on the sticker's top left; from a stop on the right it is mirrored onto its top
  right (`Avi` `tilt` / `facing`; it glides in from the side it faces).
- **Album** (`features/achievements/`, route `/album`): achievements derived from the
  stored progress only (lessons, whole topics, whole levels, the longest streak, XP, placement,
  words practiced, study cards; `model/achievements.ts`), so they need no storage and follow sync.
  There is a level sticker for every level ("Nivel A1 completo" … "Nivel C1 completo"), but the
  album and home's count only show those of levels with lessons (`albumAchievements`): with A1
  to C1 bundled, all 21 stickers. Won ones are
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
  a results card (aciertos, XP, streak with its clip chain, the daily goal), the stickers earned
  for the album,
  then "Para repasar": up to six missed items (wrong or almost) with their Spanish gloss
  (`model/items-to-review.ts`), or a short line when everything was right.
- **Sounds** (`src/infrastructure/sound/`): eight short sounds synthesized by
  `scripts/generate-sounds.mjs` (deterministic, no dependencies; `pnpm generate:sounds`
  rewrites `assets/sounds/*.wav`, 16-bit mono 44.1 kHz, -6 dBFS peak). `tap` when choosing an
  option or a word, `correct` / `almost` / `wrong` when feedback appears, `complete` when a
  lesson, review or placement result is saved, then `streak` when that session extended the
  streak, then `achievement` when it earned album stickers. Placement only taps (it gives no per-question feedback).
  `press` (a 45 ms paper tick, 4 KB, volume 0.2 against 0.35 for `tap` and 0.7–0.85 for
  feedback) clicks on every other press: the shared primitives (`PressableScale`, hence
  `Button`, `ChoiceRow`, path nodes, Profundiza and card rows, the account link and the theme
  switch; `PaperStrip`; `BackArrowButton`; `SoundToggleButton`) call `usePressSound`
  (`shared/ui/press-sound.ts`), which throttles taps closer than 80 ms (one throttle for the
  whole app) and never throws or waits. Disabled presses do not fire. Where the press has its own
  sound, the primitive's `pressSound={false}` skips the click: "Comprobar" (the verdict), the
  last "Continuar" (`complete`), options and word strips (their `tap`). The sound switch clicks
  after it flips, so turning sounds on clicks and muting is silent. Sounds are loaded once, never
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

  | Where                             | What                                                                                                                                                                                                          | Duration                          |
  | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
  | Feedback, correct                 | highlighter swipe over the answer (`Highlight animate`)                                                                                                                                                       | 250 ms                            |
  | Feedback, wrong / almost          | red-pen strike drawn left → right over the off words, then the margin note fades/settles in                                                                                                                   | 250 ms + 150 ms                   |
  | Choice rows, buttons, index rows  | press-in scale to 0.97 (`PressableScale`), no hover                                                                                                                                                           | 90 ms                             |
  | Next exercise                     | page turn: the new page comes in from the right (`PageTurn`)                                                                                                                                                  | 220 ms                            |
  | Word order                        | strips dragged from the bank to the line, reordered, or off it back to the bank; lift while dragging, spring settle, `tap` sound + light haptic on drop                                                       | spring                            |
  | Feedback, points                  | the "+10" / "+5" sticker pops in with a bounce and settles a little higher; the answered progress step pops once                                                                                              | ≈ 650 / 250 ms                    |
  | Summary                           | the sticker is slapped on, Avi glides in, confetti falls; perfect page: the stamp lands; XP counts up; a grown streak rolls and hooks a new clip; earned album stickers rise in, with the `achievement` sound | ≈ 1.4 s in all                    |
  | Home path                         | a lesson completed since home was last seen gets its sticker slapped on and its check drawn once (`model/completion-memory.ts`); Avi glides to the next lesson                                                | ≈ 900 / 700 ms                    |
  | Home Avi, entering a state        | wave (welcome back, ±6° twice), hop (a lesson, 10 pt with `SLAP_SPRING`), loop (a badge, one 360° roll on an arc), droop (missed you, 12° and 4 pt down, stays), perk up                                      | 600 / ≈ 500 / 900 / 400 / 250 ms  |
  | Home Avi, while home is on screen | a gentle hover (2.5 pt) and a blink; only while home is focused and the app or tab is visible (`useAppVisible`), none at all with reduced motion                                                              | 1.4 s each way / 150 ms every 4 s |

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
worker with no failed request, the press, tap and feedback sounds really play (`__e2e.playedSounds`)
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

App identity lives in `app.json`: version `0.3.0`, `android.versionCode` `1` (increment it for
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

- **Pronunciation depends on the device's voices and is not verified on an iPhone yet.** Unit
  tests drive the service with a fake `speechSynthesis` and e2e stubs it on Chromium and WebKit;
  real iOS still needs a manual check (Home Screen app included). The voice and its quality are the
  device's: iOS ships compact voices, and better ones ("Enhanced", "Premium") must be downloaded
  in Settings → Accessibility → Spoken Content. Desktop Chrome's Google voices are network voices
  and are never used: with only those, there are no speaker buttons. The speakers appear once the
  voices load, on iOS sometimes only after the first tap. Native has no pronunciation (no
  expo-speech).

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

Daily reviews prioritize items whose latest answer today was wrong, including items scheduled
for a later date. A correct retry removes that priority. Other due reviews fill the remaining
allowance, without exceeding 20 completed review exercises per local date.

**Referencia** (`/diccionario`) is a read-only phrasal-verb appendix: 125 authored entries from
phrasal-verb cards, free-practice groups and an audited list of course items taught under other topics, organized under their existing topic titles. All topics appear in one continuous list with headings and dividers, followed by
the Spanish meanings and bilingual examples. All text comes from the bundled
corpus; browsing makes no progress writes and works offline after the app is cached.

The reference search filters English verbs and Spanish meanings locally, ignoring case and
accents. Empty topics disappear from results; clearing the query restores the complete list.
