# @english-learn/storage-sqlite

SQLite implementation of the domain `ProgressRepository` and `SettingsRepository` ports. Pure TypeScript: it depends only on
`@english-learn/domain` and on a minimal `SqlDatabase` interface (the subset of expo-sqlite's
`SQLiteDatabase` it uses), so the app passes its expo-sqlite database directly.

- `migrate(db)`: versioned migrations tracked in `PRAGMA user_version`; idempotent, one
  transaction per migration. Refuses databases created by a newer schema.
- `createSqliteProgressRepository(db)`: review states (batch upsert in a transaction), streak,
  XP (`addXp` is atomic and resolves to the new total) and placement result.
  `saveSessionResults(itemIds, compute)` completes a lesson or review in ONE transaction: it
  reads the items' states and the streak, calls the pure `compute`, then writes the returned
  states, XP delta and streak. All or nothing, so a failed save can be retried. (expo-sqlite's
  `withTransactionAsync` caveat applies: unrelated queries issued concurrently on the same
  connection may land inside the transaction; the app issues none while saving.) Empty database →
  `[]`, `EMPTY_STREAK`, `0`, `null`.
- `createSqliteSettingsRepository(db)`: app preferences in a `setting` key/value table
  (migration 2). `getSoundEnabled()` is `true` unless the learner turned sounds off;
  `getLookupHintDismissed()` is `false` until `setLookupHintDismissed()` (the word-lookup hint).

Tests run against a real SQLite through Node's built-in `node:sqlite` (`src/testing/`), with no
native npm dependencies.

```sh
pnpm --filter @english-learn/storage-sqlite test
pnpm --filter @english-learn/storage-sqlite typecheck
```
