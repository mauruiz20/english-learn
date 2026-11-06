# @english-learn/storage-sqlite

SQLite implementation of the domain `ProgressRepository` and `SettingsRepository` ports. Pure TypeScript: it depends only on
`@english-learn/domain` and on a minimal `SqlDatabase` interface (the subset of expo-sqlite's
`SQLiteDatabase` it uses), so the app passes its expo-sqlite database directly.

- `migrate(db)`: versioned migrations tracked in `PRAGMA user_version`; idempotent, one
  transaction per migration. Refuses databases created by a newer schema. Resolves to the
  version it found: after an upgrade the caller refolds (`rebuildFromEvents`), since a cache
  table a migration adds starts empty (the app's `initProgressStore` does).
  Migration 6 → 7 drops the `rewards` cache (migration 6: the fold's plumas, purchases and
  equips) and the `plumas_welcome` setting: plumas and Avi's wardrobe were withdrawn
  (`docs/design/avi-rewards.md`). Dropping is safe: the table was a pure derivation of the event
  log that only this app read, an older app refuses the newer schema anyway, and the
  `item_purchased` / `item_equipped` events stay in the log (the fold ignores them).
  Migration 7 → 8 adds the `item_history` cache (the fold's `itemHistory`: per item its last
  answer date, last lapse date and latest grades as JSON), read with `getItemHistories()` for
  "Mis palabras difíciles"; the refold after the upgrade fills it.
- `createSqliteProgressRepository(db, { now? })`: progress as an **append-only event log**
  (migration 3: `event` table, see `@english-learn/domain` "Progress event log"). The
  `review_state`, `xp`, `streak`, `placement_result` and `lesson_result` (migration 4: each
  lesson's best accuracy and completions, `getLessonResults()`) and `item_history`
  (`getItemHistories()`) tables are a cache of
  `foldEvents` over
  the whole log, so reads stay fast; every write updates them in the same transaction and writes
  only the review states and lesson results that changed.
  - **Incremental fold** (migration 5: `fold_snapshot`). One row holds the domain's `FoldSnapshot`
    of the whole log (JSON), the number of events it covers and the `foldRulesFingerprint` it
    was computed with. A write applies only the events it actually inserted (`advanceFold`) and
    stores the new snapshot with the cache; it still costs the snapshot's size (parse, rebuild,
    write) and a `COUNT(*)` of the log, kept on purpose as the guard below. It refolds the whole
    log instead (and rewrites both) when there is no snapshot (first write after the upgrade,
    after `clearProgress`), when it has another format version or other fold rules (the first
    write after an app update that changed them), when its event count is not the log's minus
    the new events (a write that bypassed it), or when `advanceFold`
    refuses: an event sorting before the cursor (a pulled event from another device or an older
    date), an unorderable one, or a review in a session already folded. Either way the cache is
    exactly `foldEvents` of the log (property-tested against a full refold).
  - Cost on `node:sqlite` with a 50k-event log (`pnpm --filter @english-learn/storage-sqlite
bench`, median): saving a 13-event session ≈ 3 ms (was ≈ 240 ms, a full refold per write);
    a write that must refold ≈ 240 ms. The snapshot is ≈ 283 KiB (review states plus completed
    and reviewed session ids).
  - `appendEvents(events)`: inserts local events (malformed ones are refused) and refreshes the
    cache, in ONE transaction; resolves to `{ before, after }` totals (XP, streak), so the caller
    shows exactly what the fold paid. All or nothing, so a failed save can be retried.
    (expo-sqlite's `withTransactionAsync` caveat applies: unrelated queries issued concurrently on
    the same connection may land inside the transaction; the app issues none while saving.)
  - `rebuildFromEvents()`: recomputes the cache and the fold snapshot from the log.
  - `ensureDeviceId(generate)` / `getDeviceId()`: a stable per-install id in `sync_state`.
  - `ensureBaseline(build)`: upgrade path. When the log is empty and the cache tables hold
    progress (written before the event log), stores the ONE `baseline_imported` event `build`
    returns for it; the app adds the envelope and `completedLessonIds`, which storage cannot know.
    Atomic and idempotent.
  - Sync store: `getUnsyncedEvents(limit)` (oldest first), `markSynced(ids, serverSeqs)`,
    `getSyncCursor()` / `setSyncCursor(n)` (last pulled server sequence, 0 at first), and
    `insertRemoteEvents(events)` (idempotent by id, stored as synced, then the cache is updated;
    events this version cannot read are kept for the fold to skip, unorderable ones are dropped).
    Empty database → `[]`, `EMPTY_STREAK`, `0`, `null`. `markSynced` takes `null` for a sequence
    the server did not report.
  - Account lifecycle: `replaceDeviceId(id)` (the server said the id belongs to another account),
    `resetSyncState()` (every event unsynced again, cursor 0: the next account receives the whole
    log; progress unchanged) and `clearProgress()` (deletes every event, the cache and the fold
    snapshot, keeps the device id).
  - Transfer to another web origin: `getAllEvents()` (the whole log, oldest first, synced or not)
    and `importEvents(events)` (idempotent by id; new events are stored as **unsynced local**
    events, so the next sync uploads them, never marked synced; then the cache is updated, in one
    transaction; resolves to the number added).
  - **Unstorable events**: an envelope whose `id`, `deviceId`, `localDate` or `type` is not
    well-formed Unicode (a lone surrogate, which SQLite would read back as U+FFFD) is skipped by
    `insertRemoteEvents` / `importEvents` and refused by `appendEvents`, like an unorderable one.
- `createSqliteSettingsRepository(db)`: app preferences in a `setting` key/value table
  (migration 2). `getSoundEnabled()` is `true` unless the learner turned sounds off;
  `getPronunciationEnabled()` likewise for the pronunciation buttons, and `getSpeechRate()` is
  `"normal"` unless the learner picked `"slow"` (no migration: new keys of the same table);
  `getLookupHintDismissed()` is `false` until `setLookupHintDismissed()` (the word-lookup hint).
  `getAccount()` / `setAccount({ userId, email, givenName? })` / `clearAccount()` remember who is
  signed in and their first name for the home greeting (never a token; an unreadable value reads
  as signed out, an unreadable name as no name), and
  `getSaveProgressSuggestionDismissed()` the one-time "save your progress" card.
  `getMigratedTo()` / `setMigratedTo(origin)` remember where this device's progress was
  transferred (the old web address then sends the learner there).
  `getLastHomeVisit()` / `setLastHomeVisit(date)` keep the date home was last opened on this
  device, for Avi's "welcome back" (`null` before the first visit or when unreadable).

Tests run against a real SQLite through Node's built-in `node:sqlite` (`src/testing/`), with no
native npm dependencies.

```sh
pnpm --filter @english-learn/storage-sqlite test
pnpm --filter @english-learn/storage-sqlite typecheck
```
