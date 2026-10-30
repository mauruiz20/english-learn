# @english-learn/storage-sqlite

SQLite implementation of the domain `ProgressRepository` port. Pure TypeScript: it depends only on
`@english-learn/domain` and on a minimal `SqlDatabase` interface (the subset of expo-sqlite's
`SQLiteDatabase` it uses), so the app passes its expo-sqlite database directly.

- `migrate(db)`: versioned migrations tracked in `PRAGMA user_version`; idempotent, one
  transaction per migration. Refuses databases created by a newer schema.
- `createSqliteProgressRepository(db)`: review states (batch upsert in a transaction), streak,
  XP (`addXp` is atomic and resolves to the new total) and placement result. Empty database →
  `[]`, `EMPTY_STREAK`, `0`, `null`.

Tests run against a real SQLite through Node's built-in `node:sqlite` (`src/testing/`), with no
native npm dependencies.

```sh
pnpm --filter @english-learn/storage-sqlite test
pnpm --filter @english-learn/storage-sqlite typecheck
```
