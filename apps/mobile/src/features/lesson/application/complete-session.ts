import {
  exercisesOn,
  type LocalDate,
  type ProgressRepository,
  type Streak,
} from "@english-learn/domain";
import {
  answerDisputedEvent,
  itemReviewedEvent,
  newEventId,
  sessionCompletedEvent,
  type RandomBytes,
} from "@/features/progress/progress-events";
import { finalGrades } from "../model/final-grades";
import type { LessonSummary } from "../model/lesson-session";

export type CompleteSessionInput = {
  readonly repository: ProgressRepository;
  readonly summary: LessonSummary;
  /** The day the session is saved; every event of the save carries it. */
  readonly today: LocalDate;
  /** Wall clock (epoch ms) of the save. */
  readonly nowMs: number;
  readonly randomBytes: RandomBytes;
  /** This install's id (known before the save starts, so the save is ONE repository write). */
  readonly deviceId: string;
  /**
   * - "lesson": `summary.lessonId` is written, and the fold pays the completion bonus the FIRST
   *   time that lesson is completed (on any device).
   * - "review": answer XP only (daily review).
   */
  readonly kind: "lesson" | "review";
};

export type CompleteSessionResult = {
  /** XP total after the session. */
  readonly xp: number;
  /** XP this session added, as the fold decided it (answer XP plus any bonus). */
  readonly xpEarned: number;
  readonly streak: Streak;
  /** This session extended the streak (the first session of a day; celebrated with a sound). */
  readonly streakIncreased: boolean;
  /**
   * Exercises answered today with this session (the daily goal's count), or null when reading it
   * back failed (the session is saved all the same).
   */
  readonly exercisesToday: number | null;
};

/**
 * Persists a finished lesson or review as events, in one transaction: one `item_reviewed` per
 * practiced item with its final grade (worst grade wins, looked-up cap) and one
 * `session_completed` (with the number of exercises answered, for the daily goal), all sharing a
 * new session id and `today`, plus one `answer_disputed` per answer the learner marked as
 * correct. Review states, XP, bonus, streak and today's exercises are what the fold of the whole
 * log makes of them.
 */
export async function completeSession({
  repository,
  summary,
  today,
  nowMs,
  randomBytes,
  deviceId,
  kind,
}: CompleteSessionInput): Promise<CompleteSessionResult> {
  const stamp = { deviceId, occurredAt: nowMs, localDate: today, randomBytes };
  const sessionId = newEventId(stamp);
  const reviews = [...finalGrades(summary)].map(([itemId, grade]) =>
    itemReviewedEvent(stamp, sessionId, itemId, grade),
  );
  const session = sessionCompletedEvent(stamp, {
    sessionId,
    kind,
    ...(kind === "lesson" ? { lessonId: summary.lessonId } : {}),
    answerXp: summary.answerXp,
    accuracy: summary.accuracy,
    exercises: summary.verdicts.length,
  });
  // Content feedback for the owner; the fold ignores them (the grades above already count them).
  const disputes = (summary.disputes ?? []).map((dispute) => answerDisputedEvent(stamp, dispute));
  const { before, after } = await repository.appendEvents([...reviews, session, ...disputes]);
  return {
    xp: after.xp,
    xpEarned: after.xp - before.xp,
    streak: after.streak,
    streakIncreased: after.streak.current > before.streak.current,
    exercisesToday: await readExercisesToday(repository, today),
  };
}

/**
 * Today's count once the session is saved. A failed read must not fail the save: retrying it
 * would write the session twice.
 */
async function readExercisesToday(
  repository: ProgressRepository,
  today: LocalDate,
): Promise<number | null> {
  try {
    return exercisesOn(await repository.getDailyExercises(), today);
  } catch (error: unknown) {
    console.error("Failed to read today's exercises", error);
    return null;
  }
}
