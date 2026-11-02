import type { Corpus, Exercise } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { useAppServices } from "@/infrastructure/services/app-services";
import { cardPath } from "@/features/cards/card-routes";
import { cardByExerciseId } from "@/features/cards/model/card-catalog";
import { SessionGlossary } from "@/features/glossary/session-glossary";
import { topicByItemId } from "@/features/topics/topic-colors";
import { useLeaveConfirmation } from "@/shared/navigation/leave-confirmation";
import { completeSession } from "./application/complete-session";
import { itemsToReview } from "./model/items-to-review";
import { lessonExercises } from "./model/lesson-catalog";
import { lessonRecap, type RecapItem } from "./model/lesson-recap";
import {
  canDispute,
  startLesson,
  type LessonSessionState,
  type SessionInfo,
} from "./model/lesson-session";
import { prepareExercise, type PreparedExercise } from "./model/prepare-exercise";
import { responseText } from "./model/response";
import { LESSON_COPY, LessonView, type LessonViewState, type SessionCopy } from "./lesson-view";
import { useExerciseSession, type ExerciseSession, type SaveState } from "./use-exercise-session";
import { sessionResults } from "./model/session-results";
import { useNewAchievements } from "@/features/achievements/use-new-achievements";
import type { EarnedSticker } from "./components/session-screens";

type LessonContainerProps = {
  lessonId: string;
  /** Content source; defaults to the bundled corpus. */
  content?: Corpus;
};

/**
 * Runs one lesson: session reducer + exercise components, then persists the results. Its summary
 * recaps the lesson's new items and offers "Repetir lección", which runs it again from the start
 * (a new session: answer XP again, never a second completion bonus).
 */
export function LessonContainer({ lessonId, content = corpus }: LessonContainerProps) {
  const router = useRouter();
  // Each attempt is a fresh session (new shuffles, new session id when saved).
  const [attempt, setAttempt] = useState(0);
  const lesson = content.lessonsById.get(lessonId);
  const unit =
    lesson === undefined
      ? null
      : {
          info: lesson,
          topic: lesson.topic,
          exercises: lessonExercises(lesson, content.exercisesById),
          recap: lessonRecap(lesson, content),
        };
  return (
    <PracticeSession
      key={attempt}
      unit={unit}
      content={content}
      copy={LESSON_COPY}
      leaveTitle="¿Salir de la lección?"
      onDone={() => (router.canDismiss() ? router.dismissAll() : router.replace("/"))}
      onOpenCard={(cardId) => router.push(cardPath(cardId, { fromSession: true }))}
      onOpenRecapCard={(cardId) => router.push(cardPath(cardId))}
      onRedo={() => setAttempt((n) => n + 1)}
    />
  );
}

/** What a practice session runs: a lesson, or the exercises of a study card. */
export type PracticeUnit = {
  readonly info: SessionInfo;
  /** Topic slug: tints the progress label, the lookup card and the summary sticker. */
  readonly topic: string | undefined;
  readonly exercises: readonly Exercise[];
  /** "Lo nuevo de hoy" on the summary (lessons only). */
  readonly recap?: readonly RecapItem[] | undefined;
};

/**
 * Runs a lesson-like session over `unit` (the lesson flow: exercises, feedback, sounds, word
 * lookups, summary) and saves it as a lesson with `unit.info.id` as its lessonId. With
 * `onOpenCard`, wrong or almost feedback offers the study card that explains the exercise.
 */
export function PracticeSession({
  unit,
  content,
  copy,
  leaveTitle,
  onDone,
  onOpenCard,
  onOpenRecapCard,
  onRedo,
}: {
  unit: PracticeUnit | null;
  content: Corpus;
  copy: SessionCopy;
  leaveTitle: string;
  onDone: () => void;
  onOpenCard?: ((cardId: string) => void) | undefined;
  /** Opens a recap item's study card from the summary. */
  onOpenRecapCard?: ((cardId: string) => void) | undefined;
  /** "Repetir lección" on the summary. */
  onRedo?: (() => void) | undefined;
}) {
  const { progressRepository, clock, random, randomBytes, deviceId } = useAppServices();

  // Prepared once per mount, so options are not reshuffled on re-render.
  const [initial] = useState<ExerciseSession | null>(() => {
    if (unit === null || unit.exercises.length === 0) return null;
    return {
      state: startLesson(unit.info, unit.exercises),
      prepared: unit.exercises.map((e) => prepareExercise(e, random)),
    };
  });
  const {
    session,
    save,
    onSubmit,
    onContinue,
    onDispute,
    onLookup,
    retrySave,
    canLeave,
    hasUnsavedAnswers,
  } = useExerciseSession({
    initial,
    complete: (summary) =>
      completeSession({
        repository: progressRepository,
        summary,
        today: clock.today(),
        nowMs: clock.nowMs(),
        randomBytes,
        deviceId,
        kind: "lesson",
      }),
  });
  const { dialog } = useLeaveConfirmation(hasUnsavedAnswers, leaveTitle);
  const achievements = useNewAchievements(save.status === "saved", content);
  const topic = unit?.topic;

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: canLeave, headerBackVisible: canLeave }} />
      <SessionGlossary content={content} topic={topic} onLookupItems={onLookup}>
        <LessonView
          state={withAchievements(
            toViewState(session, initial?.prepared ?? [], save, content, topic, unit?.recap),
            achievements,
          )}
          copy={copy}
          onSubmit={onSubmit}
          onContinue={onContinue}
          onDispute={onDispute}
          onGoHome={onDone}
          onRetrySave={retrySave}
          onOpenCard={onOpenCard}
          onOpenRecapCard={onOpenRecapCard}
          onRedo={onRedo}
        />
      </SessionGlossary>
      {dialog}
    </>
  );
}

/** The summary also announces the album stickers the lesson earned. */
function withAchievements(
  state: LessonViewState,
  achievements: readonly EarnedSticker[],
): LessonViewState {
  return state.status === "summary" && achievements.length > 0 ? { ...state, achievements } : state;
}

function toViewState(
  session: LessonSessionState | null,
  prepared: readonly PreparedExercise[],
  save: SaveState,
  content: Corpus,
  topic: string | undefined,
  recap: readonly RecapItem[] | undefined,
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
      streakIncreased: save.streakIncreased,
      toReview: itemsToReview(itemOutcomes, content.itemsById, { topics: topicByItemId(content) }),
      topic,
      recap,
    };
  }
  const current = prepared[session.index];
  if (current === undefined) return { status: "not-found" };
  return {
    status: "exercise",
    title: session.lesson.title,
    topic,
    position: session.index + 1,
    total: session.exercises.length,
    prepared: current,
    passage:
      current.type === "reading" ? content.passagesById.get(current.exercise.passageId) : undefined,
    feedback:
      session.status === "feedback"
        ? {
            ...session.feedback,
            given: responseText(session.response),
            disputable: canDispute(session),
          }
        : null,
    results: sessionResults(session),
    card: cardByExerciseId(content).get(current.exercise.id),
  };
}
