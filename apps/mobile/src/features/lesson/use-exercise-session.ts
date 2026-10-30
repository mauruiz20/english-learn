import { useRef, useState } from "react";
import { useAppServices } from "@/infrastructure/services/app-services";
import type { CompleteSessionResult } from "./application/complete-session";
import {
  lessonSessionReducer,
  type LessonSessionState,
  type LessonSummary,
} from "./model/lesson-session";
import type { PreparedExercise } from "./model/prepare-exercise";
import type { ExerciseResponse } from "./model/response";

export type SaveState =
  | { readonly status: "idle" | "saving" | "error" }
  | { readonly status: "saved"; readonly xpEarned: number; readonly streakDays: number };

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
  const { clock } = useAppServices();
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
      .then(({ xpEarned, streak }) =>
        setSave({ status: "saved", xpEarned, streakDays: streak.current }),
      )
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
    setSession(lessonSessionReducer(session, { type: "answer", response, responseMs }));
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
    retrySave,
    // Leaving mid-save would show a stale home; the save is quick, so block back until it ends.
    canLeave: save.status !== "saving",
  };
}
