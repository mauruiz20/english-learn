import { performance } from "node:perf_hooks";
import { expect, it } from "vitest";
import { migrate } from "./migrations";
import { createSqliteProgressRepository } from "./sqlite-progress-repository";
import { createNodeSqliteDatabase } from "./testing/node-sqlite-database";
import { syntheticLog, syntheticSession } from "./testing/synthetic-log";

/**
 * Write latency of the progress store with a large log (`pnpm bench`). Prints the median of a
 * few runs per operation; not part of `pnpm test`.
 */
const LOG_SIZE = Number(process.env.BENCH_LOG_SIZE ?? 50_000);
const RUNS = 7;

async function median(task: () => Promise<unknown>): Promise<number> {
  const times: number[] = [];
  for (let run = 0; run < RUNS; run++) {
    const start = performance.now();
    await task();
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[Math.floor(RUNS / 2)] ?? Number.NaN;
}

it(`progress store with a ${LOG_SIZE}-event log`, { timeout: 600_000 }, async () => {
  const db = createNodeSqliteDatabase();
  await migrate(db);
  await createSqliteProgressRepository(db).importEvents(syntheticLog(LOG_SIZE));
  const repository = createSqliteProgressRepository(db);
  // Sessions after the log's last one, so their events sort after it (the usual case).
  let session = 10_000;
  let old = 0;

  const results = {
    "save one session (13 events)": await median(() =>
      repository.appendEvents(syntheticSession(session++)),
    ),
    "pull one remote session (13 events)": await median(() =>
      repository.insertRemoteEvents(syntheticSession(session++, "r")),
    ),
    "first save after reopening the store": await median(() =>
      createSqliteProgressRepository(db).appendEvents(syntheticSession(session++)),
    ),
    "save a session dated before the latest event": await median(() =>
      repository.appendEvents(syntheticSession(old++, "old")),
    ),
    "rebuild from events": await median(() => repository.rebuildFromEvents()),
  };
  console.table(
    Object.entries(results).map(([operation, ms]) => ({ operation, "median ms": ms.toFixed(1) })),
  );
  expect(Object.values(results).every(Number.isFinite)).toBe(true);
});
