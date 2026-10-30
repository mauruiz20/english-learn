import { EMPTY_STREAK, localDate, type ProgressRepository } from "@english-learn/domain";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { awaitPendingWrites } from "./await-pending-writes";

const TODAY = localDate("2026-10-29");

/** Makes `saveSessionResults` wait until `commit()` is called. */
function withSlowSave(repository: ProgressRepository) {
  const save = repository.saveSessionResults.bind(repository);
  let commit: () => void = () => {};
  repository.saveSessionResults = (itemIds, compute) =>
    new Promise((resolve, reject) => {
      commit = () => save(itemIds, compute).then(resolve, reject);
    });
  return { commit: () => commit() };
}

const addTenXp: Parameters<ProgressRepository["saveSessionResults"]>[1] = () => ({
  states: [],
  xpDelta: 10,
  streak: { ...EMPTY_STREAK, current: 1, longest: 1, lastActiveDate: TODAY },
});

describe("awaitPendingWrites", () => {
  it("makes reads started during a save wait for it to commit", async () => {
    const fake = createFakeRepository();
    const slow = withSlowSave(fake);
    const repository = awaitPendingWrites(fake);

    const saved = repository.saveSessionResults([], addTenXp);
    // e.g. the learner pressed browser back mid-save and home loads its data.
    const xp = repository.getXp();
    const streak = repository.getStreak();
    slow.commit();

    await expect(saved).resolves.toMatchObject({ xp: 10 });
    await expect(xp).resolves.toBe(10);
    await expect(streak).resolves.toMatchObject({ current: 1 });
  });

  it("still lets reads run after a failed save", async () => {
    const fake = createFakeRepository({ xp: 5 });
    fake.saveSessionResults = () => Promise.reject(new Error("disk I/O error"));
    const repository = awaitPendingWrites(fake);

    const saved = repository.saveSessionResults([], addTenXp);
    const xp = repository.getXp();

    await expect(saved).rejects.toThrow("disk I/O error");
    await expect(xp).resolves.toBe(5);
  });

  it("reads right away when nothing is being written", async () => {
    const repository = awaitPendingWrites(createFakeRepository({ xp: 7 }));

    await expect(repository.getXp()).resolves.toBe(7);
    await expect(repository.getPlacementResult()).resolves.toBeNull();
    await expect(repository.getReviewStates()).resolves.toEqual([]);
  });

  it("waits for every kind of write", async () => {
    const fake = createFakeRepository();
    const placement = fake.savePlacementResult.bind(fake);
    let commit: () => void = () => {};
    fake.savePlacementResult = (level, theta) =>
      new Promise((resolve) => {
        commit = () => resolve(placement(level, theta));
      });
    const repository = awaitPendingWrites(fake);

    const saved = repository.savePlacementResult("B1", 0.5);
    const read = repository.getPlacementResult();
    commit();

    await saved;
    await expect(read).resolves.toEqual({ level: "B1", theta: 0.5 });
  });
});
