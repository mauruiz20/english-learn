import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { useAppServices } from "@/infrastructure/services/app-services";
import { topicByItemId } from "@/features/topics/topic-colors";
import { useLeaveConfirmation } from "@/shared/navigation/leave-confirmation";
import { completeSession } from "./application/complete-session";
import { itemsToReview } from "./model/items-to-review";
import { lessonExercises } from "./model/lesson-catalog";
import { startLesson, type LessonSessionState } from "./model/lesson-session";
import { prepareExercise, type PreparedExercise } from "./model/prepare-exercise";
import { responseText } from "./model/response";
import { LessonView, type LessonViewState } from "./lesson-view";
import { useExerciseSession, type ExerciseSession, type SaveState } from "./use-exercise-session";

type LessonContainerProps = {
  lessonId: string;
  /** Content source; defaults to the bundled corpus. */
  content?: Corpus;
};

/** Runs one lesson: session reducer + exercise components, then persists the results. */
export function LessonContainer({ lessonId, content = corpus }: LessonContainerProps) {
  const { progressRepository, clock, random } = useAppServices();
  const router = useRouter();

  // Prepared once per mount, so options are not reshuffled on re-render.
  const [initial] = useState<ExerciseSession | null>(() => {
    const lesson = content.lessonsById.get(lessonId);
    const exercises = lesson === undefined ? [] : lessonExercises(lesson, content.exercisesById);
    if (lesson === undefined || exercises.length === 0) return null;
    return {
      state: startLesson(lesson, exercises),
      prepared: exercises.map((e) => prepareExercise(e, random)),
    };
  });
  const { session, save, onSubmit, onContinue, retrySave, canLeave, hasUnsavedAnswers } =
    useExerciseSession({
      initial,
      complete: (summary) =>
        completeSession({
          repository: progressRepository,
          summary,
          today: clock.today(),
          bonus: "lesson",
        }),
    });
  const { dialog } = useLeaveConfirmation(hasUnsavedAnswers, "¿Salir de la lección?");

  const goHome = () => (router.canDismiss() ? router.dismissAll() : router.replace("/"));

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: canLeave, headerBackVisible: canLeave }} />
      <LessonView
        state={toViewState(session, initial?.prepared ?? [], save, content)}
        onSubmit={onSubmit}
        onContinue={onContinue}
        onGoHome={goHome}
        onRetrySave={retrySave}
      />
      {dialog}
    </>
  );
}

function toViewState(
  session: LessonSessionState | null,
  prepared: readonly PreparedExercise[],
  save: SaveState,
  content: Corpus,
): LessonViewState {
  if (session === null) return { status: "not-found" };
  if (session.status === "finished") {
    if (save.status === "error") return { status: "save-error" };
    if (save.status !== "saved") return { status: "saving" };
    const { verdicts, itemOutcomes } = session.summary;
    return {
      status: "summary",
      correct: verdicts.filter((v) => v === "correct").length,
      total: verdicts.length,
      xpEarned: save.xpEarned,
      streakDays: save.streakDays,
      toReview: itemsToReview(itemOutcomes, content.itemsById, { topics: topicByItemId(content) }),
    };
  }
  const current = prepared[session.index];
  if (current === undefined) return { status: "not-found" };
  return {
    status: "exercise",
    title: session.lesson.title,
    topic: content.lessonsById.get(session.lesson.id)?.topic,
    position: session.index + 1,
    total: session.exercises.length,
    prepared: current,
    passage:
      current.type === "reading" ? content.passagesById.get(current.exercise.passageId) : undefined,
    feedback:
      session.status === "feedback"
        ? { ...session.feedback, given: responseText(session.response) }
        : null,
  };
}
