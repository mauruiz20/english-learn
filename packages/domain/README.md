# @english-learn/domain

Pure TypeScript domain logic for the app. Zero runtime dependencies, no I/O, deterministic:
time and randomness are always injected (`LocalDate` values, `Clock` port, `rng: () => number`).
It does not import `@english-learn/content`; the app layer maps content into these input types.

## Modules

| Folder            | Responsibility                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `answer-matching` | Grades free-text answers: `correct` / `almost` / `wrong`                                                 |
| `srs`             | SM-2 scheduling, outcome → grade mapping, session selection                                              |
| `difficulty`      | "Mis palabras difíciles": per-item difficulty score and buckets from review states and history           |
| `scoring`         | XP per answer, lesson completion bonus, accuracy                                                         |
| `streak`          | Daily streak (current / longest)                                                                         |
| `progress`        | Per-level seen / mastered counts                                                                         |
| `progress-log`    | Append-only progress events, UUIDv7 ids, deterministic `foldEvents`, incremental `advanceFold`           |
| `placement`       | Adaptive placement test (CAT) → CEFR level                                                               |
| `shuffle`         | Fisher–Yates shuffle, option shuffling, word-order token scrambling                                      |
| `local-date`      | Branded `YYYY-MM-DD` date with pure calendar math (no timezones)                                         |
| `cefr`            | `Level` (`A1`…`C1`)                                                                                      |
| `glossary`        | Static word/phrase lookup: tokenizer, index, text annotation                                             |
| `ports`           | Side-effect interfaces: `Clock`, `ProgressRepository`, `ProgressSyncStore`, `SettingsRepository` (types) |

Everything is re-exported from `src/index.ts`.

## Answer matching

Both the input and every accepted answer go through the same pipeline:

1. **Normalize**: Unicode NFC, curly quotes/apostrophes → straight, lowercase, collapse whitespace,
   remove spaces before punctuation, strip leading/trailing punctuation and quotes (so a final
   `.`, `!` or `?` is ignored).
2. **Expand contractions** to a canonical form: `won't` → `will not`, `can't`/`cannot` → `can not`,
   `n't` → ` not`, `'m` → ` am`, `'re` → ` are`, `'ve` → ` have`, `'ll` → ` will`.
   Ambiguous `'s` (is / has / possessive) and `'d` (would / had) produce several candidates;
   the answer is **correct** if any input candidate equals any accepted candidate.
   Candidates are capped at 16 per answer (further ambiguous contractions keep their first reading).
3. **Typo tolerance** (Levenshtein on canonical forms). The answer is **almost** when:
   - the input is not empty, and
   - the distance is > 0 and ≤ 1 (accepted length ≤ 10), ≤ 2 (≤ 25) or ≤ 3 (longer), and
   - it is a typo inside one word: same word count, exactly one word differs, and that word
     needs fewer edits than half its length. This keeps grammar mistakes such as
     `in` → `on`, `a` → `an`, or a missing/extra word as **wrong**.

`closest` is the original text of the accepted answer with the smallest distance.

### Answer patterns (`translate_write`)

One `accepted` entry can stand for many sentences (`pattern.ts`):

| Syntax        | Meaning                                              | Example                               |
| ------------- | ---------------------------------------------------- | ------------------------------------- |
| `{a\|b\|c}`   | exactly one alternative; an alternative may be empty | `It is {very \|}cold.`                |
| `[x]`         | optional (the reading without it comes first)        | `I [really ]like it.`                 |
| `[a\|b]`      | nothing, or one of the alternatives                  | `Thanks[ a lot\| so much].`           |
| nesting       | groups nest freely                                   | `I get up {early\|at six[ o'clock]}.` |
| `\` + char    | literal `{ } [ ] \| \`                               | `\{not a group\}`                     |
| anything else | literal text                                         |                                       |

Whitespace of each expansion is normalized (runs collapse, ends trimmed, no space before
`.,!?;:`), so spaces may sit inside or outside the brackets. Expansions keep the alternatives'
order without duplicates; the first expansion of the first entry is the reference answer shown
after a wrong answer.

- `expandPattern(pattern, limit = MAX_PATTERN_EXPANSIONS)`: `{ ok: true, expansions }` or
  `{ ok: false, error }` (syntax error, or more than `limit` (2,000) sentences, detected by
  counting before expanding).
- `expandAccepted(accepted)`: every entry expanded, concatenated, deduplicated; memoized per array
  (corpus arrays are stable), so an exercise expands once. An invalid entry counts as literal text
  (the content validator forbids it).
- `matchPatternAnswer(input, accepted)`: `matchAnswer` against `expandAccepted(accepted)`; `closest`
  is the matching (or nearest) expansion. `matchAnswer` caches the canonical readings of an accepted
  array (by identity) and stops at the first exact match.

## SRS (SM-2)

- `review(state, grade, today)`: grade < 3 is a lapse (reps = 0, interval = 1 day, lapses + 1);
  otherwise the interval goes 1 → 6 → `round(interval × ease)` using the ease from before the review.
- Ease is updated on **every** grade (as in the original SM-2) with
  `ease + (0.1 − (5−g)(0.08 + (5−g)·0.02))`, floored at 1.3.
- Grade mapping (`gradeFromOutcome`):

  | Outcome                            | Grade |
  | ---------------------------------- | ----- |
  | wrong                              | 1     |
  | almost                             | 3     |
  | correct, `responseMs > expectedMs` | 4     |
  | correct, on time                   | 5     |

- `applyReview(state | undefined, itemId, grade, today)`: how one item moves after a session, given
  its FINAL grade for that session. New + grade ≥ 3 → `review(initialState)`; new + grade < 3 → fresh
  (default ease, reps 0, lapses 0) due tomorrow — first sight is not forgetting; not due yet
  (`dueDate > today`) + grade ≥ 3 → unchanged (practice, replays cannot inflate intervals); not due
  - grade < 3 → SM-2 lapse; due → `review`.
- `selectSession`: due items (`dueDate ≤ today`) by dueDate asc, lapses desc, itemId; then unseen new items.

## Difficulty ("Mis palabras difíciles")

`itemDifficulty(state, history)` derives, per reviewed item, `lapses`, `ease`, `intervalDays`
(from its `ReviewState`), `recentAccuracy`, `recentFails`, `lastFailed`, `lastSeen` and
`lastLapse` (from the fold's item history, see below), a `score` and a bucket. Pure and
clock-free: the same state and history always give the same result.

| Bucket                      | Rule (checked in this order)                                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Difíciles** (`hard`)      | any of: the latest answer failed (grade < 3); ≥ `HARD_RECENT_FAILS` (2) failing answers among the latest 5; ease ≤ `HARD_EASE` (1.7) **and** a failing answer among the latest 5 |
| **Dominadas** (`mastered`)  | interval ≥ `MASTERED_INTERVAL_DAYS` (21, the mastery interval of `levelProgress`)                                                                                                |
| **En proceso** (`learning`) | everything else                                                                                                                                                                  |

- **Recent answers, not lifetime lapses**: `lapses` never goes down, so "≥ 2 lapses" would keep
  an item difficult forever however well it is answered now. A lapse counts while it is among the
  latest 5 answers (two of them) or is the latest one.
- **Ease 1.7, not 2.0**: one lapse from the default ease leaves 1.96, so a 2.0 threshold would
  mark every item missed once until a perfect due review; 1.7 is about two lapses' worth.
- **Low ease never alone**: SM-2 ease only rises with perfect (grade 5) due answers; "almost"
  (grade 3) lowers it and correct-but-slow (grade 4) keeps it. An item lapsed twice long ago and
  then answered right 8 times (ease 1.62, interval 110 days), or never missed but "almost" 7
  times (ease 1.52), would stay difficult forever. Low ease marks a chronically hard item only
  while a miss is still among its latest 5 answers; it also raises the score.
- **Score** (orders the list, higher is harder): 3 if the latest answer failed, + 2 per recent
  fail, + 2 for low ease, + 1 per lapse (at most 5). `hardItems` sorts by score, then most
  recently seen, then itemId.
- `classifyItems(states, histories)`, `bucketCounts`, and `hardPracticeProgress(before, after,
practicedIds)`: of the practiced items that were difficult, how many left Difíciles.

## Progress event log

Learner progress is an **append-only log of immutable events**; every number the app shows (review
states, XP, streak, placement) is `foldEvents(events)`. Devices sync by exchanging events they do
not have yet (set union). Because the fold depends only on the _set_ of events — not on arrival
order or duplicates — every device that holds the same events computes the same progress, with no
conflict resolution and no "last write wins" data loss.

### Events

Envelope: `{ id, deviceId, occurredAt, localDate, type, payload }`. `id` is a UUIDv7
(`uuidv7(nowMs, random)`, RFC 9562: 48-bit ms timestamp, version 7, variant `10`, 74 random bits;
ids from different milliseconds sort by time). Every payload carries `v: 1`.

| `type`                | Payload                                                                | Written                                   |
| --------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| `item_reviewed`       | `sessionId, itemId, grade`                                             | once per item per session, FINAL grade    |
| `session_completed`   | `sessionId, kind: "lesson" \| "review", lessonId?, answerXp, accuracy` | when a session is saved                   |
| `placement_completed` | `level, theta`                                                         | when the placement test ends              |
| `baseline_imported`   | `states, xp, streak, placement, completedLessonIds?`                   | once per device, migrating pre-event data |
| `answer_disputed`     | `exerciseId, itemIds, answer (trimmed, ≤ 200 chars), accepted: false`  | with a session, per self-regraded answer  |

**Retired types** (`RETIRED_EVENT_TYPES`): `item_purchased` and `item_equipped`, written by the
withdrawn plumas wardrobe (`docs/design/avi-rewards.md`). Logs and the sync server may still hold
them, so the fold accepts them with any payload and ignores them: no progress, no anomaly.

The app applies worst-grade-wins and the looked-up cap (grade ≤ 3) **before** writing
`item_reviewed`. The fold decides everything else, including the lesson bonus. All events of one
session carry the same `localDate` (the day it was completed), as the app used one `today` per save.

### Fold

1. Events whose envelope cannot be ordered (empty id, invalid `localDate`, non-finite
   `occurredAt`) are skipped and reported.
2. Total order: `(localDate, occurredAt, id)`, then canonical JSON content (so the order is total
   even for corrupted duplicates).
3. Dedupe by `id`: identical copies fold once; different content under one id keeps the first in
   order and reports a `conflicting_duplicate`.
4. Every event is applied at its position — **baselines too** (they are not hoisted to the front).
   Unknown `type` or payload `v` → skipped and reported `unsupported_event` (forward compatible);
   malformed fields → `invalid_event`; a retired type → skipped silently. The fold never throws;
   skipped events are listed in `anomalies`.

| Data             | Rule                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review states    | `item_reviewed` → `applyReview(state, itemId, grade, event.localDate)`; a second review of the same item in the same session is skipped                                                                                                                                                                                                                                |
| XP               | Σ `answerXp` + Σ baseline `xp` + the lesson bonus; a repeated `sessionId` is skipped (never paid twice)                                                                                                                                                                                                                                                                |
| Lesson bonus     | The FIRST `session_completed` for a `lessonId` in fold order gets `xpForLessonCompletion(accuracy)`; later ones (any device) and baseline-completed lessons get 0                                                                                                                                                                                                      |
| Streak           | `recordActivity` replayed over the sorted unique `localDate`s of `session_completed`, starting from the merged baseline streak                                                                                                                                                                                                                                         |
| `activeDates`    | Sorted unique `localDate`s of `session_completed`                                                                                                                                                                                                                                                                                                                      |
| Lesson results   | Per `lessonId` of a lesson `session_completed`: `bestAccuracy` = max `accuracy`, `completions` = distinct sessions; baseline lessons have none                                                                                                                                                                                                                         |
| Placement        | The last `placement_completed` or non-null baseline placement in fold order                                                                                                                                                                                                                                                                                            |
| Item history     | Per item with an applied `item_reviewed` (same duplicate rule as its state): `lastSeen` (its date), `lastLapse` (date of a grade < 3 on an item that already had a state, the review that increments `lapses`), `recentGrades` (latest `RECENT_GRADES` = 5, oldest first). Practice of a not-due item counts though its state does not move; baseline states have none |
| Disputed answers | `answer_disputed` is a known no-op: no state, no anomaly (content feedback for the owner; the session's own events carry the regrade)                                                                                                                                                                                                                                  |
| Baseline states  | Per item, keep the state with the latest `dueDate`, then the most `reps` (the state already folded wins a full tie)                                                                                                                                                                                                                                                    |
| Baseline streaks | `longest` = max; `current` and `lastActiveDate` from the most recent `lastActiveDate` (larger `current` on a tie)                                                                                                                                                                                                                                                      |
| Baseline lessons | `completedLessonIds` are unioned (no bonus for them later)                                                                                                                                                                                                                                                                                                             |

Property tests (fast-check) check permutation invariance, idempotence under duplication, union
convergence of two devices, a single bonus per lesson across devices, and an oracle: replaying
generated single-device histories with the pre-event app rules gives the same progress as folding
the events the app would write.

### Incremental fold (snapshots)

Refolding the whole log on every write costs time proportional to the log. A **snapshot** lets a
store apply only the new events:

- `foldSnapshot(events)`: the fold's full state as plain JSON-safe data (`FoldSnapshot`, format
  `FOLD_SNAPSHOT_VERSION`): review states, XP, merged baseline streak, placement, active dates,
  completed lessons, lesson results, item histories, the ids of completed and of reviewed sessions, the
  anomalies, and a **cursor**: the position `(localDate, occurredAt, id, canonical content)` of the last
  orderable event in fold order. Arrays are sorted, so equal folds give equal snapshots.
- `advanceFold(snapshot, events)`: applies `events` on top, giving exactly `foldSnapshot` of the
  whole new log. Precondition: none of their ids is already in the folded log (a store keyed by
  id passes only the events it inserted). It returns `null` (the caller refolds the whole log)
  when the events cannot just go after the cursor: one sorts at or before it (an older date, or
  another device's event pulled by sync), one cannot be ordered (those are reported first), or one
  reviews an item in a session that already has folded reviews (detecting a duplicate review
  would need every `sessionId/itemId`). A repeated `session_completed` is exact without a refold:
  its session id is in the snapshot.
- `snapshotProgress(snapshot)`: the `ProgressState`; `foldEvents(events)` is
  `snapshotProgress(foldSnapshot(events))`, so the rules above are unchanged.

Property tests check that keeping a snapshot with `advanceFold` (refolding when it refuses) always
equals a full refold, for random batches from several devices, out of order, with conflicting ids
and re-delivered duplicates, and that a snapshot survives a JSON round trip.

**Changing the fold rules.** Stored snapshots carry the rules they were computed with, which
include `applyReview`, `xpForLessonCompletion` and `parseEvent` outside `fold.ts`. Two guards:

- `FOLD_RULES_CORPUS` (`fold-rules.ts`) is a fixed log that exercises every rule and anomaly.
  `fold-rules.test.ts` compares its `foldSnapshot` with `fold-rules.golden.json`, pinned for the
  current `FOLD_SNAPSHOT_VERSION`. If the output changes, CI fails until the version is bumped
  and the golden is regenerated:
  `UPDATE_FOLD_GOLDEN=1 pnpm --filter @english-learn/domain test fold-rules`, then `pnpm format`.
- `foldRulesFingerprint()` is `v<version>-<FNV-1a hash of that fold>`. Stores keep it with
  their snapshot and refold once when it differs, so every app update re-derives the cache under
  the rules it ships.

**Change from the pre-event app rule**: the app paid the lesson bonus when "at least one item of the
lesson had no review state yet". Lessons share items, so a lesson first completed after its items
were learned elsewhere earned no bonus. The fold pays it (first completion per `lessonId`); this is
the only difference the oracle finds, and it never removes a bonus the app paid. The baseline's
`completedLessonIds` (lessons whose items all have a state at migration) keeps replays of lessons
finished before the migration from earning the bonus again.

### Moving a log to another origin

The web app moved address, and each origin keeps its own on-device log. A transfer copies the old
origin's events into the new one (`importEvents`, see `@english-learn/storage-sqlite`): a set
union by id, like a sync, so the fold of the result does not depend on what the new origin
already had.

- The old origin's log may hold its own `baseline_imported` (pre-event progress). A new origin
  that started empty never writes one (`ensureBaseline` writes nothing for empty progress), so the
  merged log has exactly that one baseline and its XP is counted once.
- Baselines are summed by design (each one is a different device's pre-event progress). Two
  baselines describing the SAME progress would double its XP; no flow writes that.
- Lessons finished on both origins earn the lesson bonus once (first `session_completed` in fold
  order); lessons in the baseline's `completedLessonIds` earn none. Every session's `answerXp`
  counts, since each session is distinct practice.

### Limitations

- `localDate` comes from the device calendar and is the primary ordering key; device clock skew
  only affects ordering among events with the same `localDate`.
- Ids from the same millisecond have no monotonic counter; order there falls back to the random
  bits (still deterministic, since the id is part of the event).
- A device whose calendar is wrong writes events on the wrong date; the fold cannot detect that.

## Glossary

Static English → Spanish lookup for hover (web) / tap (mobile). Entries come from
`@english-learn/content` (`data/glossary/`); this module only tokenizes and matches.

- `GlossaryEntry`: `{ id, headword, kind: "word" | "phrase", forms, senses: { es, pos? }[] }`.
  `forms` are lowercase surface forms (headword, inflections, contractions such as `won't`).
- `glossaryKey(text)`: lookup key — NFC, curly → straight apostrophes, lowercase.
- `tokenizeForGlossary(text, isForm?)`: `Token[]` (`{ kind: "word" | "other", text, start, end }`)
  alternating words and the text between them; the texts concatenate to the input exactly.
  - Apostrophes stay inside words (`won't`, `I'm`, `city's`). A trailing apostrophe is left out
    (a plural possessive `students'` looks like a closing quote `'the dishes'`), so both read as
    the bare word. Dotted abbreviations stay whole (`p.m.`).
  - Anything containing a digit (`2019`, `3rd`, `8:30`) and punctuation is `other`.
  - A hyphenated word stays whole only if `isForm(key)` knows it; otherwise it is split at hyphens.
- `buildGlossaryIndex(entries)`: maps forms to entry ids (first entry wins on a duplicate form; the
  content validator forbids duplicates).
- `lookupWord(index, word)`: case-insensitive. **Possessives**: if `x's` / `xs'` is not itself a
  listed form, it falls back to `x` / `xs` (`city's` → `city`, `students'` → `students`). A listed
  form always wins, so `it's` resolves to its own entry. (`annotateText` never sees `xs'`, since
  the tokenizer drops the trailing apostrophe.)
- `annotateText(text, index)`: `Segment[]` (`{ text, start, end, entryId, kind }`). Phrases first,
  longest form wins (`show me around` over `show me`), and phrase words must be separated by
  whitespace only (no match across punctuation or a cloze `___`); then single words. Uncovered
  words and other text have `entryId: null`. Segments rebuild the text exactly.

## Placement (CAT)

- **Model**: 3PL with discrimination fixed at 1 and fixed guessing
  `P(correct | θ) = c + (1 − c) / (1 + e^{−(θ − b)})`, `c = 1 / optionCount`.
- **Difficulty `b`** defaults from the item's CEFR level: A1 −2, A2 −1, B1 0, B2 1, C1 2.
- **Estimation**: EAP over a θ grid [−4, 4] (step 0.05) with a N(0, 1) prior, in log space.
  `se` is the posterior SD.
- **Item selection**: the unused item with maximum Fisher information at the current θ;
  near-ties (≤ 1e-6) are broken with the injected rng.
- **Stopping**: 20 questions, or ≥ 15 with `se < 0.4`, or when the bank runs out.
- **Level**: θ cutoffs −1.5 / −0.5 / 0.5 / 1.5 (a value on a cutoff goes to the upper level).
- **API**: `createPlacementSession` → `currentQuestion` → `answer(session, id, correct, rng)` →
  `placementResult`. Sessions are plain immutable data (serializable); the rng is passed per call.

> **Caveat**: item difficulties are CEFR-derived _priors_, not calibrated parameters. Results are a
> reasonable starting level, not a certified score. Calibration (fitting `b` per item from real
> responses) is planned once the phase-2 backend collects data.

## Scripts

```sh
pnpm --filter @english-learn/domain test
pnpm --filter @english-learn/domain typecheck
```
