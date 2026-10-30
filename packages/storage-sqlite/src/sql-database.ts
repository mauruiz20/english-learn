/** A value that can be bound to a SQL parameter. */
export type SqlValue = string | number | null;

/**
 * Minimal async SQLite surface used by this package.
 *
 * It is the subset of expo-sqlite's `SQLiteDatabase` the adapters need, so an expo database
 * can be passed directly. Tests use an implementation over Node's built-in `node:sqlite`.
 */
export interface SqlDatabase {
  /** Executes one or more statements without parameters. */
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<unknown>;
  getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
  /** Runs `task` inside a transaction: commits when it resolves, rolls back when it rejects. */
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
