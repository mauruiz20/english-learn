import {
  localDate,
  type ProgressEvent,
  type ProgressRepository,
  type ProgressSyncStore,
} from "@english-learn/domain";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import {
  DatabaseReleasedError,
  awaitPendingWrites,
  createWriteTracker,
  trackWrites,
} from "./await-pending-writes";

const TODAY = localDate("2026-10-29");

const reviewSession: ProgressEvent = {
  id: "0190a000-0000-7000-8000-000000000001",
  deviceId: "test-device",
  occurredAt: 1,
  localDate: TODAY,
  type: "session_completed",
  payload: { v: 1, sessionId: "s1", kind: "review", answerXp: 10, accuracy: 1 },
};

const placement: ProgressEvent = {
  id: "0190a000-0000-7000-8000-000000000002",
  deviceId: "test-device",
  occurredAt: 1,
  localDate: TODAY,
  type: "placement_completed",
  payload: { v: 1, level: "B1", theta: 0.5 },
};

/** Makes `appendEvents` wait until `commit()` is called. */
function withSlowAppend(repository: ProgressRepository) {
  const append = repository.appendEvents.bind(repository);
  let commit: () => void = () => {};
  repository.appendEvents = (events) =>
    new Promise((resolve, reject) => {
      commit = () => append(events).then(resolve, reject);
    });
  return { commit: () => commit() };
}

describe("awaitPendingWrites", () => {
  it("makes reads started during a save wait for it to commit", async () => {
    const fake = createFakeRepository();
    const slow = withSlowAppend(fake);
    const repository = awaitPendingWrites(fake);

    const saved = repository.appendEvents([reviewSession]);
    // e.g. the learner pressed browser back mid-save and home loads its data.
    const xp = repository.getXp();
    const streak = repository.getStreak();
    slow.commit();

    await expect(saved).resolves.toMatchObject({ after: { xp: 10 } });
    await expect(xp).resolves.toBe(10);
    await expect(streak).resolves.toMatchObject({ current: 1 });
  });

  it("still lets reads run after a failed save", async () => {
    const fake = createFakeRepository({ xp: 5 });
    fake.appendEvents = () => Promise.reject(new Error("disk I/O error"));
    const repository = awaitPendingWrites(fake);

    const saved = repository.appendEvents([reviewSession]);
    const xp = repository.getXp();

    await expect(saved).rejects.toThrow("disk I/O error");
    await expect(xp).resolves.toBe(5);
  });

  it("reads right away when nothing is being written", async () => {
    const repository = awaitPendingWrites(createFakeRepository({ xp: 7 }));

    await expect(repository.getXp()).resolves.toBe(7);
    await expect(repository.getPlacementResult()).resolves.toBeNull();
    await expect(repository.getReviewStates()).resolves.toEqual([]);
    await expect(repository.getDeviceId()).resolves.toBe("test-device");
  });

  it("waits for every kind of write", async () => {
    const fake = createFakeRepository();
    let commit: () => void = () => {};
    const rebuild = jest.fn(async () => {});
    fake.rebuildFromEvents = () =>
      new Promise((resolve) => {
        commit = () => resolve(rebuild());
      });
    const repository = awaitPendingWrites(fake);
    await repository.appendEvents([placement]);

    const rebuilt = repository.rebuildFromEvents();
    let read = false;
    const placementRead = repository.getPlacementResult().then((value) => {
      read = true;
      return value;
    });
    await Promise.resolve();
    expect(read).toBe(false);
    commit();

    await rebuilt;
    await expect(placementRead).resolves.toEqual({ level: "B1", theta: 0.5 });
    expect(rebuild).toHaveBeenCalledTimes(1);
  });
});

describe("createWriteTracker: handing the database to another tab", () => {
  it("drain waits for the save in flight, then refuses new writes", async () => {
    const fake = createFakeRepository();
    const slow = withSlowAppend(fake);
    const tracker = createWriteTracker();
    const repository = awaitPendingWrites(fake, tracker);

    const saved = repository.appendEvents([reviewSession]);
    let drained = false;
    const drain = tracker.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    slow.commit();
    await drain;

    await expect(saved).resolves.toMatchObject({ after: { xp: 10 } });
    await expect(repository.appendEvents([placement])).rejects.toThrow(DatabaseReleasedError);
    await expect(repository.getXp()).resolves.toBe(10);
  });

  it("tracks the sync's writes too", async () => {
    let finish: () => void = () => {};
    const store: ProgressSyncStore = {
      getUnsyncedEvents: async () => [],
      markSynced: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      getSyncCursor: async () => 0,
      setSyncCursor: async () => {},
      insertRemoteEvents: async () => 0,
    };
    const tracker = createWriteTracker();
    const tracked = trackWrites(store, tracker, [
      "markSynced",
      "setSyncCursor",
      "insertRemoteEvents",
    ]);

    const marking = tracked.markSynced(["a"], [1]);
    let drained = false;
    const drain = tracker.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    finish();
    await Promise.all([marking, drain]);

    await expect(tracked.setSyncCursor(3)).rejects.toThrow(DatabaseReleasedError);
    await expect(tracked.insertRemoteEvents([])).rejects.toThrow(DatabaseReleasedError);
    await expect(tracked.getSyncCursor()).resolves.toBe(0);
  });
});
