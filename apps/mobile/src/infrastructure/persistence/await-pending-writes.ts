import type { ProgressRepository } from "@english-learn/domain";

/** A write started after the database was handed over to another tab (see `drain`). */
export class DatabaseReleasedError extends Error {
  constructor() {
    super("The database was handed over to another tab");
    this.name = "DatabaseReleasedError";
  }
}

export type WriteTracker = {
  /** Runs `run` as a tracked write (rejects with `DatabaseReleasedError` once drained). */
  write<T>(run: () => Promise<T>): Promise<T>;
  /** Resolves once every write in flight settled (whether it succeeded or failed). */
  settled(): Promise<void>;
  /** Refuses new writes, then waits for the ones in flight: nothing is cut halfway. */
  drain(): Promise<void>;
};

export function createWriteTracker(): WriteTracker {
  const pending = new Set<Promise<unknown>>();
  let closed = false;

  const settled = async () => {
    while (pending.size > 0) await Promise.all(pending);
  };

  return {
    write<T>(run: () => Promise<T>): Promise<T> {
      if (closed) return Promise.reject(new DatabaseReleasedError());
      const promise = run();
      const done = promise.then(
        () => undefined,
        () => undefined,
      );
      pending.add(done);
      void done.then(() => pending.delete(done));
      return promise;
    },
    settled,
    drain() {
      closed = true;
      return settled();
    },
  };
}

/**
 * `repository` where every read first waits for the writes already in flight (whether they
 * succeed or fail). A save keeps running if its screen goes away (e.g. browser back during
 * "Guardando…"), and the home screen that loads right after then reads the committed data
 * instead of a stale snapshot. Writes themselves are not reordered or repeated.
 */
export function awaitPendingWrites(
  repository: ProgressRepository,
  tracker: WriteTracker = createWriteTracker(),
): ProgressRepository {
  const read = async <T>(run: () => Promise<T>): Promise<T> => {
    await tracker.settled();
    return run();
  };

  return {
    getReviewStates: (itemIds) => read(() => repository.getReviewStates(itemIds)),
    getStreak: () => read(() => repository.getStreak()),
    getXp: () => read(() => repository.getXp()),
    getPlacementResult: () => read(() => repository.getPlacementResult()),
    getLessonResults: () => read(() => repository.getLessonResults()),
    getCheckpointEvidence: (checkpointId, lessonId) =>
      read(() => repository.getCheckpointEvidence(checkpointId, lessonId)),
    getItemHistories: () => read(() => repository.getItemHistories()),
    getDailyExercises: () => read(() => repository.getDailyExercises()),
    getDailyReviewExercises: (date) => read(() => repository.getDailyReviewExercises(date)),
    getDeviceId: () => repository.getDeviceId(),
    appendEvents: (events) => tracker.write(() => repository.appendEvents(events)),
    rebuildFromEvents: () => tracker.write(() => repository.rebuildFromEvents()),
  };
}

/**
 * `target` whose `writes` methods go through `tracker` (e.g. the sync's bookkeeping and pulled
 * events); every other method is passed through unchanged.
 */
export function trackWrites<T extends object>(
  target: T,
  tracker: WriteTracker,
  writes: readonly (keyof T & string)[],
): T {
  const tracked = new Set<PropertyKey>(writes);
  return new Proxy(target, {
    get(object, property) {
      const value: unknown = Reflect.get(object, property, object);
      if (typeof value !== "function") return value;
      const method = (value as (...args: unknown[]) => unknown).bind(object);
      if (!tracked.has(property)) return method;
      return (...args: unknown[]) => tracker.write(async () => method(...args));
    },
  });
}
