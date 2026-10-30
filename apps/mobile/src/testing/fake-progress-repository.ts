import type {
  PlacementResult,
  ProgressRepository,
  ReviewState,
  Streak,
} from "@english-learn/domain";

export type FakeProgressRepository = ProgressRepository & {
  /** Current in-memory contents, for assertions. */
  readonly snapshot: () => {
    streak: Streak;
    xp: number;
    placement: PlacementResult | null;
    states: ReviewState[];
  };
};

/** In-memory `ProgressRepository` for tests. */
export function createFakeRepository(
  initial: {
    streak?: Streak;
    xp?: number;
    placement?: PlacementResult | null;
    states?: readonly ReviewState[];
  } = {},
): FakeProgressRepository {
  let streak: Streak = initial.streak ?? { current: 0, longest: 0, lastActiveDate: null };
  let xp = initial.xp ?? 0;
  let placement = initial.placement ?? null;
  const states = new Map((initial.states ?? []).map((s) => [s.itemId, s]));
  return {
    getReviewStates: async (itemIds) =>
      [...states.values()].filter((s) => itemIds === undefined || itemIds.includes(s.itemId)),
    saveReviewStates: async (next) => {
      for (const s of next) states.set(s.itemId, s);
    },
    getStreak: async () => streak,
    saveStreak: async (next) => {
      streak = next;
    },
    getXp: async () => xp,
    addXp: async (amount) => (xp += amount),
    // Mirrors the SQLite all-or-nothing contract: compute and validate before writing anything.
    saveSessionResults: async (itemIds, compute) => {
      const results = compute({
        states: [...states.values()].filter((s) => itemIds.includes(s.itemId)),
        streak,
      });
      if (!Number.isInteger(results.xpDelta) || results.xpDelta < 0) {
        throw new RangeError(`XP amount must be a non-negative integer, got ${results.xpDelta}`);
      }
      for (const s of results.states) states.set(s.itemId, s);
      streak = results.streak;
      xp += results.xpDelta;
      return { xp, results };
    },
    getPlacementResult: async () => placement,
    savePlacementResult: async (level, theta) => {
      placement = { level, theta };
    },
    snapshot: () => ({ streak, xp, placement, states: [...states.values()] }),
  };
}
