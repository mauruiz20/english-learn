import { DatabaseSync } from "node:sqlite";
import type { SqlDatabase, SqlValue } from "../sql-database";

/** Test adapter: implements `SqlDatabase` over Node's built-in synchronous SQLite. */
export function createNodeSqliteDatabase(path = ":memory:"): SqlDatabase & { close(): void } {
  const db = new DatabaseSync(path);

  return {
    async execAsync(source) {
      db.exec(source);
    },
    async runAsync(source, params: SqlValue[]) {
      return db.prepare(source).run(...params);
    },
    async getFirstAsync<T>(source: string, params: SqlValue[]) {
      return (db.prepare(source).get(...params) ?? null) as T | null;
    },
    async getAllAsync<T>(source: string, params: SqlValue[]) {
      return db.prepare(source).all(...params) as T[];
    },
    async withTransactionAsync(task) {
      db.exec("BEGIN");
      try {
        await task();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    close() {
      db.close();
    },
  };
}
