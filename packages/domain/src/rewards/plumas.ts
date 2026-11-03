/**
 * Plumas: the currency learners earn for studying well and on time, and spend dressing Avi.
 * Derived by the fold from existing progress events, like XP (see `docs/design/avi-rewards.md`).
 */

/** Where plumas come from, in the order the fold pays them within one event. */
export const PLUMAS_SOURCES = [
  "study_day",
  "new_lesson",
  "perfect_page",
  "on_time_review",
  "daily_review",
  "study_week",
  "welcome",
] as const;

export type PlumasSource = (typeof PLUMAS_SOURCES)[number];

export type PlumasBySource = Readonly<Record<PlumasSource, number>>;

/** Plumas per occurrence of each source (section 2.1 of the design). */
export const PLUMAS_RULES: PlumasBySource = {
  /** First `session_completed` of a `localDate`. */
  study_day: 5,
  /** First `session_completed` of a `lessonId` (lessons and cards). */
  new_lesson: 5,
  /** First `accuracy === 1` of a `lessonId`. */
  perfect_page: 10,
  /** Per `item_reviewed` with grade ≥ 3 of an item that was due. */
  on_time_review: 1,
  /** First review session of a `localDate` with accuracy ≥ `DAILY_REVIEW_MIN_ACCURACY`. */
  daily_review: 5,
  /** When the run of consecutive study days reaches a multiple of `STUDY_WEEK_DAYS`. */
  study_week: 15,
  /** Per lesson a `baseline_imported` adds to the completed lessons (study before the log). */
  welcome: 5,
};

/** The most plumas the capped sources pay on one `localDate`. */
export const DAILY_PLUMAS_CAP = 40;

/** Sources outside the daily cap. */
export const UNCAPPED_PLUMAS_SOURCES: readonly PlumasSource[] = ["study_week", "welcome"];

export const STUDY_WEEK_DAYS = 7;

export const DAILY_REVIEW_MIN_ACCURACY = 0.8;

/** The learner's plumas and wardrobe, as the fold derives them. */
export type Rewards = {
  /** Every plumas earned (capped), all sources. */
  readonly earned: number;
  /** Σ price of the purchases that charged (the first per item). */
  readonly spent: number;
  /** `earned − spent`; negative after concurrent offline purchases (items are never taken away). */
  readonly balance: number;
  /** Lifetime plumas per source, after the cap; they add up to `earned`. */
  readonly earnedBySource: PlumasBySource;
  /** Lifetime plumas the daily cap held back (capped sources only). */
  readonly overCap: number;
  /** Sorted ids of the items bought (unknown ids kept, so newer catalogues survive). */
  readonly ownedItemIds: readonly string[];
  /** Per slot, the item worn (`null`: taken off); slots sorted, unknown slots kept. */
  readonly equipped: Readonly<Record<string, string | null>>;
};

/** The plumas part of the totals a write reports (before and after). */
export type PlumasTotals = Pick<
  Rewards,
  "earned" | "spent" | "balance" | "earnedBySource" | "overCap"
>;

export const NO_PLUMAS: PlumasBySource = {
  study_day: 0,
  new_lesson: 0,
  perfect_page: 0,
  on_time_review: 0,
  daily_review: 0,
  study_week: 0,
  welcome: 0,
};

export const EMPTY_REWARDS: Rewards = {
  earned: 0,
  spent: 0,
  balance: 0,
  earnedBySource: NO_PLUMAS,
  overCap: 0,
  ownedItemIds: [],
  equipped: {},
};

export function plumasTotals({
  earned,
  spent,
  balance,
  earnedBySource,
  overCap,
}: Rewards): PlumasTotals {
  return { earned, spent, balance, earnedBySource, overCap };
}

/** What a write earned: the totals after minus before, per source (only the ones that paid). */
export type PlumasEarned = {
  readonly total: number;
  readonly bySource: readonly { readonly source: PlumasSource; readonly plumas: number }[];
  /** The daily cap held some plumas back in this write. */
  readonly capped: boolean;
};

export function plumasEarned(before: PlumasTotals, after: PlumasTotals): PlumasEarned {
  const bySource = PLUMAS_SOURCES.map((source) => ({
    source,
    plumas: after.earnedBySource[source] - before.earnedBySource[source],
  })).filter(({ plumas }) => plumas > 0);
  return {
    total: after.earned - before.earned,
    bySource,
    capped: after.overCap > before.overCap,
  };
}
