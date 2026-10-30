import {
  EMPTY_STREAK,
  LEVELS,
  localDate,
  type Level,
  type PlacementResult,
  type ProgressRepository,
  type ReviewState,
  type SavedSession,
  type Streak,
} from "@english-learn/domain";
import type { SqlDatabase } from "./sql-database";

type ReviewStateRow = {
  item_id: string;
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
  due_date: string;
};

type StreakRow = { current: number; longest: number; last_active_date: string | null };

type PlacementRow = { level: string; theta: number };

/** Stays well below SQLite's historical 999 bound-parameter limit. */
const MAX_IDS_PER_QUERY = 500;

const SELECT_REVIEW_STATE =
  "SELECT item_id, ease, interval_days, reps, lapses, due_date FROM review_state";

function toReviewState(row: ReviewStateRow): ReviewState {
  return {
    itemId: row.item_id,
    ease: row.ease,
    intervalDays: row.interval_days,
    reps: row.reps,
    lapses: row.lapses,
    dueDate: localDate(row.due_date),
  };
}

function toLevel(value: string): Level {
  const level = LEVELS.find((candidate) => candidate === value);
  if (level === undefined) throw new Error(`Invalid stored level: "${value}"`);
  return level;
}

function assertXpAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new RangeError(`XP amount must be a non-negative integer, got ${amount}`);
  }
}

function byItemId(a: ReviewState, b: ReviewState): number {
  return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;
}

/** `ProgressRepository` backed by SQLite. Call `migrate(db)` before using it. */
export function createSqliteProgressRepository(db: SqlDatabase): ProgressRepository {
  async function getStatesByIds(itemIds: readonly string[]): Promise<ReviewState[]> {
    const unique = [...new Set(itemIds)];
    const states: ReviewState[] = [];
    for (let start = 0; start < unique.length; start += MAX_IDS_PER_QUERY) {
      const chunk = unique.slice(start, start + MAX_IDS_PER_QUERY);
      const placeholders = chunk.map(() => "?").join(", ");
      const rows = await db.getAllAsync<ReviewStateRow>(
        `${SELECT_REVIEW_STATE} WHERE item_id IN (${placeholders})`,
        chunk,
      );
      states.push(...rows.map(toReviewState));
    }
    return states.sort(byItemId);
  }

  // Helpers below run no transaction of their own, so they compose inside one.
  async function upsertStates(states: readonly ReviewState[]): Promise<void> {
    for (const state of states) {
      await db.runAsync(
        `INSERT INTO review_state (item_id, ease, interval_days, reps, lapses, due_date)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (item_id) DO UPDATE SET
           ease = excluded.ease,
           interval_days = excluded.interval_days,
           reps = excluded.reps,
           lapses = excluded.lapses,
           due_date = excluded.due_date`,
        [state.itemId, state.ease, state.intervalDays, state.reps, state.lapses, state.dueDate],
      );
    }
  }

  async function readStreak(): Promise<Streak> {
    const row = await db.getFirstAsync<StreakRow>(
      "SELECT current, longest, last_active_date FROM streak WHERE id = 1",
      [],
    );
    if (row === null) return EMPTY_STREAK;
    return {
      current: row.current,
      longest: row.longest,
      lastActiveDate: row.last_active_date === null ? null : localDate(row.last_active_date),
    };
  }

  async function upsertStreak(streak: Streak): Promise<void> {
    await db.runAsync(
      `INSERT INTO streak (id, current, longest, last_active_date) VALUES (1, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         current = excluded.current,
         longest = excluded.longest,
         last_active_date = excluded.last_active_date`,
      [streak.current, streak.longest, streak.lastActiveDate],
    );
  }

  async function incrementXp(amount: number): Promise<number> {
    await db.runAsync(
      `INSERT INTO xp (id, total) VALUES (1, ?)
       ON CONFLICT (id) DO UPDATE SET total = total + excluded.total`,
      [amount],
    );
    const row = await db.getFirstAsync<{ total: number }>("SELECT total FROM xp WHERE id = 1", []);
    return row?.total ?? 0;
  }

  return {
    async getReviewStates(itemIds) {
      if (itemIds !== undefined) return getStatesByIds(itemIds);
      const rows = await db.getAllAsync<ReviewStateRow>(
        `${SELECT_REVIEW_STATE} ORDER BY item_id`,
        [],
      );
      return rows.map(toReviewState);
    },

    async saveReviewStates(states) {
      if (states.length === 0) return;
      await db.withTransactionAsync(() => upsertStates(states));
    },

    getStreak: readStreak,

    async saveStreak(streak) {
      await upsertStreak(streak);
    },

    async getXp() {
      const row = await db.getFirstAsync<{ total: number }>(
        "SELECT total FROM xp WHERE id = 1",
        [],
      );
      return row?.total ?? 0;
    },

    async addXp(amount) {
      assertXpAmount(amount);
      let total = 0;
      await db.withTransactionAsync(async () => {
        total = await incrementXp(amount);
      });
      return total;
    },

    async saveSessionResults(itemIds, compute) {
      let saved: SavedSession | null = null;
      await db.withTransactionAsync(async () => {
        const results = compute({
          states: await getStatesByIds(itemIds),
          streak: await readStreak(),
        });
        assertXpAmount(results.xpDelta);
        await upsertStates(results.states);
        const xp = await incrementXp(results.xpDelta);
        await upsertStreak(results.streak);
        saved = { xp, results };
      });
      if (saved === null) throw new Error("Session results were not saved");
      return saved;
    },

    async getPlacementResult() {
      const row = await db.getFirstAsync<PlacementRow>(
        "SELECT level, theta FROM placement_result WHERE id = 1",
        [],
      );
      if (row === null) return null;
      const result: PlacementResult = { level: toLevel(row.level), theta: row.theta };
      return result;
    },

    async savePlacementResult(level, theta) {
      await db.runAsync(
        `INSERT INTO placement_result (id, level, theta) VALUES (1, ?, ?)
         ON CONFLICT (id) DO UPDATE SET level = excluded.level, theta = excluded.theta`,
        [level, theta],
      );
    },
  };
}
