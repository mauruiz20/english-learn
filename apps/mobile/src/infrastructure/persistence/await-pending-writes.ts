import type { ProgressRepository } from "@english-learn/domain";

/**
 * `repository` where every read first waits for the writes already in flight (whether they
 * succeed or fail). A save keeps running if its screen goes away (e.g. browser back during
 * "Guardando…"), and the home screen that loads right after then reads the committed data
 * instead of a stale snapshot. Writes themselves are not reordered or repeated.
 */
export function awaitPendingWrites(repository: ProgressRepository): ProgressRepository {
  const pending = new Set<Promise<unknown>>();

  const write = <T>(run: () => Promise<T>): Promise<T> => {
    const promise = run();
    const settled = promise.then(
      () => undefined,
      () => undefined,
    );
    pending.add(settled);
    void settled.then(() => pending.delete(settled));
    return promise;
  };

  const read = async <T>(run: () => Promise<T>): Promise<T> => {
    if (pending.size > 0) await Promise.all(pending);
    return run();
  };

  return {
    getReviewStates: (itemIds) => read(() => repository.getReviewStates(itemIds)),
    getStreak: () => read(() => repository.getStreak()),
    getXp: () => read(() => repository.getXp()),
    getPlacementResult: () => read(() => repository.getPlacementResult()),
    getDeviceId: () => repository.getDeviceId(),
    appendEvents: (events) => write(() => repository.appendEvents(events)),
    rebuildFromEvents: () => write(() => repository.rebuildFromEvents()),
  };
}
