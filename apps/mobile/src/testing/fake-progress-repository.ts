import {
  EMPTY_STREAK,
  foldEvents,
  type PlacementResult,
  type ProgressEvent,
  type ProgressRepository,
  type ReviewState,
  type Streak,
} from "@english-learn/domain";

export const FAKE_DEVICE_ID = "test-device";

export type FakeProgressRepository = ProgressRepository & {
  /** Current progress (the fold of every event), for assertions. */
  readonly snapshot: () => {
    streak: Streak;
    xp: number;
    placement: PlacementResult | null;
    states: ReviewState[];
  };
  /** Every event appended so far (the seed baseline first, when there is one). */
  readonly events: () => ProgressEvent[];
};

/**
 * In-memory, event-backed `ProgressRepository` for tests: like the SQLite adapter, every read is
 * the fold of the log. Initial progress is seeded as ONE `baseline_imported` event, as an upgraded
 * install would have it (pass `completedLessonIds` for lessons done before the upgrade).
 */
export function createFakeRepository(
  initial: {
    streak?: Streak;
    xp?: number;
    placement?: PlacementResult | null;
    states?: readonly ReviewState[];
    completedLessonIds?: readonly string[];
  } = {},
): FakeProgressRepository {
  const log: ProgressEvent[] = [];
  const seeded = Object.values(initial).some((v) => v !== undefined && v !== null);
  if (seeded) {
    log.push({
      id: "00000000-0000-7000-8000-000000000000",
      deviceId: FAKE_DEVICE_ID,
      occurredAt: 0,
      localDate: "2000-01-01" as ProgressEvent["localDate"],
      type: "baseline_imported",
      payload: {
        v: 1,
        states: initial.states ?? [],
        xp: initial.xp ?? 0,
        streak: initial.streak ?? EMPTY_STREAK,
        placement: initial.placement ?? null,
        completedLessonIds: initial.completedLessonIds ?? [],
      },
    });
  }
  const progress = () => foldEvents(log);
  const totals = () => {
    const { xp, streak } = progress();
    return { xp, streak };
  };

  return {
    getReviewStates: async (itemIds) =>
      progress().states.filter((s) => itemIds === undefined || itemIds.includes(s.itemId)),
    getStreak: async () => progress().streak,
    getXp: async () => progress().xp,
    getPlacementResult: async () => progress().placement,
    getLessonResults: async () => progress().lessonResults,
    getItemHistories: async () => progress().itemHistory,
    getDeviceId: async () => FAKE_DEVICE_ID,
    // Mirrors the SQLite all-or-nothing contract: validate before writing anything.
    appendEvents: async (events) => {
      const { anomalies } = foldEvents(events);
      const ids = new Set(log.map((e) => e.id));
      if (anomalies.length > 0 || events.some((e) => ids.has(e.id))) {
        throw new RangeError(`Refusing to write invalid events: ${JSON.stringify(anomalies)}`);
      }
      const before = totals();
      log.push(...events);
      return { before, after: totals() };
    },
    rebuildFromEvents: async () => {},
    snapshot: () => {
      const { streak, xp, placement, states } = progress();
      return { streak, xp, placement, states: [...states] };
    },
    events: () => [...log],
  };
}
