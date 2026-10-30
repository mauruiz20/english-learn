import {
  recordActivity,
  type LocalDate,
  type ProgressRepository,
  type Streak,
} from "@english-learn/domain";
import { applyLessonResults } from "../model/apply-lesson-results";
import type { LessonSummary } from "../model/lesson-session";

export type CompleteLessonInput = {
  readonly repository: ProgressRepository;
  readonly summary: LessonSummary;
  readonly today: LocalDate;
};

export type CompleteLessonResult = { readonly xp: number; readonly streak: Streak };

/** Persists a finished lesson: SRS review states, earned XP and today's streak activity. */
export async function completeLesson({
  repository,
  summary,
  today,
}: CompleteLessonInput): Promise<CompleteLessonResult> {
  const itemIds = [...new Set(summary.itemOutcomes.map((o) => o.itemId))];
  const states = await repository.getReviewStates(itemIds);
  await repository.saveReviewStates(applyLessonResults({ summary, states, today }));
  const xp = await repository.addXp(summary.xpEarned);
  const streak = recordActivity(await repository.getStreak(), today);
  await repository.saveStreak(streak);
  return { xp, streak };
}
