import {
  EMPTY_STREAK,
  localDate,
  type ProgressRepository,
  type ReviewState,
  type Streak,
} from "@english-learn/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "./migrations";
import { createSqliteProgressRepository } from "./sqlite-progress-repository";
import { createNodeSqliteDatabase } from "./testing/node-sqlite-database";

function state(itemId: string, overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    itemId,
    ease: 2.5,
    intervalDays: 0,
    reps: 0,
    lapses: 0,
    dueDate: localDate("2026-10-29"),
    ...overrides,
  };
}

describe("createSqliteProgressRepository", () => {
  let db: ReturnType<typeof createNodeSqliteDatabase>;
  let repo: ProgressRepository;

  beforeEach(async () => {
    db = createNodeSqliteDatabase();
    await migrate(db);
    repo = createSqliteProgressRepository(db);
  });
  afterEach(() => db.close());

  describe("empty state", () => {
    it("returns defaults when nothing has been stored", async () => {
      expect(await repo.getReviewStates()).toEqual([]);
      expect(await repo.getStreak()).toEqual(EMPTY_STREAK);
      expect(await repo.getXp()).toBe(0);
      expect(await repo.getPlacementResult()).toBeNull();
    });
  });

  describe("review states", () => {
    it("round-trips every field, ordered by itemId", async () => {
      const b = state("b", {
        ease: 1.86,
        intervalDays: 6,
        reps: 2,
        lapses: 1,
        dueDate: localDate("2026-11-04"),
      });
      const a = state("a");

      await repo.saveReviewStates([b, a]);

      expect(await repo.getReviewStates()).toEqual([a, b]);
    });

    it("upserts by itemId", async () => {
      await repo.saveReviewStates([state("a"), state("b")]);
      const updated = state("a", { reps: 1, intervalDays: 1, dueDate: localDate("2026-10-30") });

      await repo.saveReviewStates([updated]);

      expect(await repo.getReviewStates()).toEqual([updated, state("b")]);
    });

    it("filters by itemIds, ignoring unknown ids", async () => {
      await repo.saveReviewStates([state("a"), state("b"), state("c")]);

      expect(await repo.getReviewStates(["c", "a", "zzz"])).toEqual([state("a"), state("c")]);
      expect(await repo.getReviewStates([])).toEqual([]);
    });

    it("handles more ids than SQLite's parameter limit", async () => {
      const states = Array.from({ length: 1200 }, (_, i) =>
        state(`item-${String(i).padStart(4, "0")}`),
      );
      await repo.saveReviewStates(states);

      const loaded = await repo.getReviewStates(states.map((s) => s.itemId));

      expect(loaded).toHaveLength(1200);
    });

    it("saves a batch atomically", async () => {
      const broken = { ...state("b"), dueDate: null } as unknown as ReviewState;

      await expect(repo.saveReviewStates([state("a"), broken])).rejects.toThrow();

      expect(await repo.getReviewStates()).toEqual([]);
    });
  });

  describe("streak", () => {
    it("round-trips and overwrites the streak", async () => {
      const first: Streak = { current: 1, longest: 1, lastActiveDate: localDate("2026-10-28") };
      const second: Streak = { current: 2, longest: 5, lastActiveDate: localDate("2026-10-29") };

      await repo.saveStreak(first);
      await repo.saveStreak(second);

      expect(await repo.getStreak()).toEqual(second);
    });

    it("stores a null last active date", async () => {
      const streak: Streak = { current: 0, longest: 3, lastActiveDate: null };
      await repo.saveStreak(streak);

      expect(await repo.getStreak()).toEqual(streak);
    });
  });

  describe("xp", () => {
    it("adds XP and resolves to the new total", async () => {
      expect(await repo.addXp(10)).toBe(10);
      expect(await repo.addXp(25)).toBe(35);
      expect(await repo.addXp(0)).toBe(35);
      expect(await repo.getXp()).toBe(35);
    });

    it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      "rejects amount %f",
      async (amount) => {
        await expect(repo.addXp(amount)).rejects.toThrow(RangeError);
        expect(await repo.getXp()).toBe(0);
      },
    );
  });

  describe("placement result", () => {
    it("round-trips and overwrites the placement result", async () => {
      await repo.savePlacementResult("A2", -0.8);
      await repo.savePlacementResult("B1", 0.12);

      expect(await repo.getPlacementResult()).toEqual({ level: "B1", theta: 0.12 });
    });
  });

  describe("session results", () => {
    const today = localDate("2026-10-29");
    const streak: Streak = { current: 3, longest: 4, lastActiveDate: today };

    it("computes the results from reads inside the transaction and writes them", async () => {
      await repo.addXp(5);
      await repo.saveReviewStates([state("a"), state("other")]);
      await repo.saveStreak({ current: 2, longest: 4, lastActiveDate: localDate("2026-10-28") });
      const updated = state("a", { reps: 1, intervalDays: 1, dueDate: localDate("2026-10-30") });
      const seen: unknown[] = [];

      const saved = await repo.saveSessionResults(["a", "b"], (current) => {
        seen.push(current);
        return { states: [updated, state("b")], xpDelta: 30, streak };
      });

      expect(seen).toEqual([
        {
          states: [state("a")],
          streak: { current: 2, longest: 4, lastActiveDate: localDate("2026-10-28") },
        },
      ]);
      expect(saved).toEqual({
        xp: 35,
        results: { states: [updated, state("b")], xpDelta: 30, streak },
      });
      expect(await repo.getXp()).toBe(35);
      expect(await repo.getReviewStates()).toEqual([updated, state("b"), state("other")]);
      expect(await repo.getStreak()).toEqual(streak);
    });

    it("accepts no items and zero XP", async () => {
      const saved = await repo.saveSessionResults([], () => ({ states: [], xpDelta: 0, streak }));

      expect(saved.xp).toBe(0);
      expect(await repo.getStreak()).toEqual(streak);
    });

    it.each([-1, 1.5, Number.NaN])("rejects xpDelta %f without writing anything", async (xp) => {
      await expect(
        repo.saveSessionResults(["a"], () => ({ states: [state("a")], xpDelta: xp, streak })),
      ).rejects.toThrow(RangeError);

      expect(await repo.getReviewStates()).toEqual([]);
      expect(await repo.getStreak()).toEqual(EMPTY_STREAK);
    });

    it("writes nothing when compute throws", async () => {
      await expect(
        repo.saveSessionResults(["a"], () => {
          throw new Error("bug");
        }),
      ).rejects.toThrow("bug");

      expect(await repo.getStreak()).toEqual(EMPTY_STREAK);
    });

    it("rolls back every write when the streak write fails", async () => {
      const failing: typeof db = {
        ...db,
        async runAsync(source, params) {
          if (source.includes("INSERT INTO streak")) throw new Error("disk I/O error");
          return db.runAsync(source, params);
        },
      };
      const failingRepo = createSqliteProgressRepository(failing);
      await repo.addXp(10);

      await expect(
        failingRepo.saveSessionResults(["a"], () => ({
          states: [state("a")],
          xpDelta: 20,
          streak,
        })),
      ).rejects.toThrow("disk I/O error");

      expect(await repo.getReviewStates()).toEqual([]);
      expect(await repo.getXp()).toBe(10);
      expect(await repo.getStreak()).toEqual(EMPTY_STREAK);
    });
  });

  it("persists across repository instances on the same database", async () => {
    await repo.addXp(15);
    await repo.savePlacementResult("B2", 1.1);

    const other = createSqliteProgressRepository(db);

    expect(await other.getXp()).toBe(15);
    expect(await other.getPlacementResult()).toEqual({ level: "B2", theta: 1.1 });
  });
});
