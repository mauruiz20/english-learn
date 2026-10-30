import {
  recordActivity,
  xpForLessonCompletion,
  type LocalDate,
  type ProgressRepository,
  type Streak,
} from "@english-learn/domain";
import { applyLessonResults } from "../model/apply-lesson-results";
import type { LessonSummary } from "../model/lesson-session";

/**
 * - "lesson": the completion bonus (`xpForLessonCompletion`) is added the first time the
 *   lesson is completed, i.e. when at least one of its items had no review state yet.
 *   A replay earns answer XP only.
 * - "none": answer XP only (daily review).
 */
export type CompletionBonus = "lesson" | "none";

export type CompleteSessionInput = {
  readonly repository: ProgressRepository;
  readonly summary: LessonSummary;
  readonly today: LocalDate;
  readonly bonus: CompletionBonus;
};

export type CompleteSessionResult = {
  /** XP total after the session. */
  readonly xp: number;
  /** XP this session added. */
  readonly xpEarned: number;
  readonly streak: Streak;
  /** This session extended the streak (the first session of a day; celebrated with a sound). */
  readonly streakIncreased: boolean;
};

/**
 * Persists a finished lesson or review in one transaction: SRS review states, earned XP and
 * today's streak activity, all computed from the progress read inside that transaction.
 */
export async function completeSession({
  repository,
  summary,
  today,
  bonus,
}: CompleteSessionInput): Promise<CompleteSessionResult> {
  const itemIds = [...new Set(summary.itemOutcomes.map((o) => o.itemId))];
  let streakBefore = 0;
  const { xp, results } = await repository.saveSessionResults(itemIds, (current) => {
    streakBefore = current.streak.current;
    const known = new Set(current.states.map((s) => s.itemId));
    const firstCompletion = itemIds.some((id) => !known.has(id));
    const bonusXp =
      bonus === "lesson" && firstCompletion ? xpForLessonCompletion(summary.accuracy) : 0;
    return {
      states: applyLessonResults({ summary, states: current.states, today }),
      xpDelta: summary.answerXp + bonusXp,
      streak: recordActivity(current.streak, today),
    };
  });
  return {
    xp,
    xpEarned: results.xpDelta,
    streak: results.streak,
    streakIncreased: results.streak.current > streakBefore,
  };
}
