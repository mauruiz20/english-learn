import type { DailyGoalStatus } from "@english-learn/domain";
import { useRef, useState } from "react";
import { sessionDailyGoal } from "@/features/daily-goal/session-goal";
import { useAppServices } from "@/infrastructure/services/app-services";
import type { CompleteSessionResult } from "./application/complete-session";
import {
  lessonSessionReducer,
  type LessonSessionState,
  type LessonSummary,
} from "./model/lesson-session";
import type { PreparedExercise } from "./model/prepare-exercise";
import type { ExerciseResponse } from "./model/response";
import { useSessionSounds } from "./use-session-sounds";

export type SaveState =
  | { readonly status: "idle" | "saving" | "error" }
  | {
      readonly status: "saved";
      readonly xpEarned: number;
      readonly streakDays: number;
      /** This session extended the streak. */
      readonly streakIncreased: boolean;
      /** Today's count against the daily goal, this session included (absent: unknown). */
      readonly dailyGoal?: DailyGoalStatus | undefined;
    };

export type ExerciseSession = {
  readonly state: LessonSessionState;
  /** One prepared (shuffled) exercise per session exercise, in order. */
  readonly prepared: readonly PreparedExercise[];
};

/**
 * Drives a lesson-like session (answer → feedback → next → finished) and saves the summary once
 * it finishes with `complete`. `initial` is read on mount only. Saving is guarded against double
 * submission; after a failure it can be retried (the save is all-or-nothing).
 */
export function useExerciseSession({
  initial,
  complete,
}: {
  initial: ExerciseSession | null;
  complete: (summary: LessonSummary) => Promise<CompleteSessionResult>;
}) {
  const { clock, settingsRepository } = useAppServices();
  const sounds = useSessionSounds();
  const [session, setSession] = useState<LessonSessionState | null>(initial?.state ?? null);
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [startedAt] = useState(() => clock.nowMs());
  const shownAt = useRef(startedAt);
  // Guards against saving twice (e.g. a double tap on the last "Continuar").
  const saving = useRef(false);

  const persist = (summary: LessonSummary) => {
    if (saving.current) return;
    saving.current = true;
    setSave({ status: "saving" });
    complete(summary)
      .then(async ({ xpEarned, streak, streakIncreased, exercisesToday }) => {
        // Never fails: an unreadable goal is the default one.
        const dailyGoal = await sessionDailyGoal(settingsRepository, exercisesToday);
        setSave({
          status: "saved",
          xpEarned,
          streakDays: streak.current,
          streakIncreased,
          dailyGoal,
        });
        sounds.completed(streakIncreased);
      })
      .catch((error: unknown) => {
        console.error("Failed to save session results", error);
        saving.current = false;
        setSave({ status: "error" });
      });
  };

  const retrySave = () => {
    if (session?.status === "finished") persist(session.summary);
  };

  const onSubmit = (response: ExerciseResponse) => {
    if (session === null) return;
    const responseMs = Math.max(0, clock.nowMs() - shownAt.current);
    const next = lessonSessionReducer(session, { type: "answer", response, responseMs });
    setSession(next);
    if (next.status === "feedback" && next !== session) sounds.verdict(next.feedback.verdict);
  };

  /** The learner looked up a word matching these items (see `lessonSessionReducer`). */
  const onLookup = (itemIds: readonly string[]) => {
    if (itemIds.length === 0) return;
    setSession((current) =>
      current === null ? current : lessonSessionReducer(current, { type: "lookup", itemIds }),
    );
  };

  /** "Mi respuesta también es correcta" on the shown translate_write answer. */
  const onDispute = () => {
    setSession((current) =>
      current === null ? current : lessonSessionReducer(current, { type: "dispute" }),
    );
  };

  const onContinue = () => {
    if (session === null) return;
    const next = lessonSessionReducer(session, { type: "next" });
    if (next === session) return;
    shownAt.current = clock.nowMs();
    setSession(next);
    if (next.status === "finished") persist(next.summary);
  };

  return {
    session,
    save,
    onSubmit,
    onContinue,
    onDispute,
    onLookup,
    retrySave,
    // Leaving mid-save would show a stale home; the save is quick, so block back until it ends.
    canLeave: save.status !== "saving",
    /** At least one answer was given and the session is not finished: leaving loses them. */
    hasUnsavedAnswers:
      session !== null &&
      session.status !== "finished" &&
      (session.status === "feedback" || session.answered.length > 0),
  };
}
