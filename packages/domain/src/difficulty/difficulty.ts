import type { LocalDate } from "../local-date";
import type { ItemHistory } from "../progress-log";
import { DEFAULT_MASTERY_INTERVAL_DAYS } from "../progress";
import type { ReviewState } from "../srs";

/** "Dominadas", "En proceso", "Difíciles". */
export type DifficultyBucket = "mastered" | "learning" | "hard";

/** Difíciles: this many failing answers (grade < 3) among the latest ones, or more. */
export const HARD_RECENT_FAILS = 2;
/**
 * Difíciles: an SM-2 ease at most this, together with a failing answer among the latest. One
 * lapse from the default ease leaves 1.96 and a correct due review gives back 0.1, so 1.7 means
 * the item lost about two lapses' worth of ease. Never on its own: ease only rises with perfect
 * (grade 5) due answers, so an item answered right but slowly or "almost" would stay difficult
 * forever.
 */
export const HARD_EASE = 1.7;
/** Dominadas: the interval of a mastered item, as in `levelProgress` and the study cards. */
export const MASTERED_INTERVAL_DAYS = DEFAULT_MASTERY_INTERVAL_DAYS;
/** Lapses count in the score up to this many. */
const SCORE_MAX_LAPSES = 5;

/** What the SRS data says about one reviewed item, and its bucket. */
export type ItemDifficulty = {
  readonly itemId: string;
  /** Times it was answered wrong after it was learned (`ReviewState.lapses`). */
  readonly lapses: number;
  readonly ease: number;
  readonly intervalDays: number;
  /** Share of passing grades (≥ 3) among its latest answers; `null` without history. */
  readonly recentAccuracy: number | null;
  /** Failing grades (< 3) among its latest answers. */
  readonly recentFails: number;
  /** Its latest answer failed. */
  readonly lastFailed: boolean;
  /** Date of its latest answer; `null` without history (a baseline state). */
  readonly lastSeen: LocalDate | null;
  readonly lastLapse: LocalDate | null;
  /**
   * How hard it is, higher is harder: 3 if the latest answer failed, + 2 per recent fail,
   * + 2 if ease ≤ `HARD_EASE`, + 1 per lapse (at most 5). Orders the difficult items.
   */
  readonly score: number;
  readonly bucket: DifficultyBucket;
};

/**
 * Classifies one reviewed item (pure, no clock: only its state and its answers count):
 *
 * - **Difíciles** if any: its latest answer failed; at least `HARD_RECENT_FAILS` (2) failing
 *   answers among the latest `RECENT_GRADES` (5); ease ≤ `HARD_EASE` (1.7) with at least one
 *   failing answer among the latest 5 (a chronically hard item missed again).
 * - **Dominadas**: not difficult and an interval of `MASTERED_INTERVAL_DAYS` (21) days or more.
 * - **En proceso**: everything else.
 *
 * Recent answers rather than lifetime lapses: `lapses` never goes down, so an item missed twice
 * long ago would stay difficult forever however well it is answered now.
 */
export function itemDifficulty(
  state: ReviewState,
  history: ItemHistory | undefined,
): ItemDifficulty {
  const grades = history?.recentGrades ?? [];
  const recentFails = grades.filter((grade) => grade < 3).length;
  const last = grades[grades.length - 1];
  const lastFailed = last !== undefined && last < 3;
  const lowEase = state.ease <= HARD_EASE;
  const hard = lastFailed || recentFails >= HARD_RECENT_FAILS || (lowEase && recentFails >= 1);
  return {
    itemId: state.itemId,
    lapses: state.lapses,
    ease: state.ease,
    intervalDays: state.intervalDays,
    recentAccuracy: grades.length === 0 ? null : (grades.length - recentFails) / grades.length,
    recentFails,
    lastFailed,
    lastSeen: history?.lastSeen ?? null,
    lastLapse: history?.lastLapse ?? null,
    score:
      (lastFailed ? 3 : 0) +
      2 * recentFails +
      (lowEase ? 2 : 0) +
      Math.min(state.lapses, SCORE_MAX_LAPSES),
    bucket: hard ? "hard" : state.intervalDays >= MASTERED_INTERVAL_DAYS ? "mastered" : "learning",
  };
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Every reviewed item's difficulty, sorted by itemId (histories without a state are ignored). */
export function classifyItems(
  states: readonly ReviewState[],
  histories: readonly ItemHistory[],
): ItemDifficulty[] {
  const historyById = new Map(histories.map((h) => [h.itemId, h]));
  return states
    .map((state) => itemDifficulty(state, historyById.get(state.itemId)))
    .sort((a, b) => byText(a.itemId, b.itemId));
}

export type BucketCounts = {
  readonly mastered: number;
  readonly learning: number;
  readonly hard: number;
};

export function bucketCounts(items: readonly ItemDifficulty[]): BucketCounts {
  const counts = { mastered: 0, learning: 0, hard: 0 };
  for (const item of items) counts[item.bucket] += 1;
  return counts;
}

/** The difficult items, hardest first (score), then the most recently seen, then by itemId. */
export function hardItems(items: readonly ItemDifficulty[]): ItemDifficulty[] {
  return items
    .filter((item) => item.bucket === "hard")
    .sort(
      (a, b) =>
        b.score - a.score ||
        byText(b.lastSeen ?? "", a.lastSeen ?? "") ||
        byText(a.itemId, b.itemId),
    );
}

/**
 * What a practice of difficult items achieved: of the `practicedIds` that were difficult
 * `before`, how many are no longer difficult `after`.
 */
export function hardPracticeProgress(
  before: readonly ItemDifficulty[],
  after: readonly ItemDifficulty[],
  practicedIds: readonly string[],
): { readonly practiced: number; readonly movedOut: number } {
  const wasHard = new Set(before.filter((d) => d.bucket === "hard").map((d) => d.itemId));
  const bucketAfter = new Map(after.map((d) => [d.itemId, d.bucket]));
  const practiced = [...new Set(practicedIds)].filter((id) => wasHard.has(id));
  return {
    practiced: practiced.length,
    movedOut: practiced.filter((id) => bucketAfter.get(id) !== "hard").length,
  };
}
