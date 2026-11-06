import type { Corpus, Exercise, LessonIntro } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useAppServices } from "@/infrastructure/services/app-services";
import { cardPath } from "@/features/cards/card-routes";
import { cardByExerciseId } from "@/features/cards/model/card-catalog";
import { SessionGlossary } from "@/features/glossary/session-glossary";
import { topicByItemId } from "@/features/topics/topic-colors";
import { useLeaveConfirmation } from "@/shared/navigation/leave-confirmation";
import { completeSession } from "./application/complete-session";
import { itemsToReview } from "./model/items-to-review";
import { isLessonDone, lessonExercises } from "./model/lesson-catalog";
import { lessonIntro } from "./model/lesson-intro";
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
import { practiceLessonPlace } from "@/features/practice/model/practice-catalog";
import { practiceCollectionPath } from "@/features/practice/practice-routes";
import { SavingScreen, type EarnedSticker } from "./components/session-screens";

type LessonContainerProps = {
  lessonId: string;
  /** Content source; defaults to the bundled corpus. */
  content?: Corpus;
};

/**
 * Runs one lesson: session reducer + exercise components, then persists the results. Its summary
 * recaps the lesson's new items and offers "Repetir lección", which runs it again from the start
 * (a new session: answer XP again, never a second completion bonus).
 *
 * A path lesson with an intro (its own, or derived from its linked card: `lessonIntro`) opens on
 * "Antes de empezar" the first time; on a redo, or once the lesson is done, the intro waits
 * collapsed above the first exercise ("Repasar la teoría"). Practice lessons have none.
 */
export function LessonContainer({ lessonId, content = corpus }: LessonContainerProps) {
  const router = useRouter();
  const { progressRepository } = useAppServices();
  // Each attempt is a fresh session (new shuffles, new session id when saved).
  const [attempt, setAttempt] = useState(0);
  // Practice lessons ("Práctica libre") play here too, and go back to their collection.
  const lesson = content.lessonsById.get(lessonId) ?? content.practiceLessonsById.get(lessonId);
  const place = practiceLessonPlace(content, lessonId);
  const intro = lesson === undefined || place !== undefined ? null : lessonIntro(lesson, content);
  const exercises = lesson === undefined ? [] : lessonExercises(lesson, content.exercisesById);
  // Whether the lesson is done decides how its intro shows; null while it is read.
  const [done, setDone] = useState<boolean | null>(intro === null ? false : null);
  useEffect(() => {
    if (intro === null || lesson === undefined) return;
    let active = true;
    progressRepository.getReviewStates([...new Set(exercises.flatMap((e) => e.itemIds))]).then(
      (states) => {
        if (!active) return;
        setDone(isLessonDone(lesson, content.exercisesById, new Set(states.map((s) => s.itemId))));
      },
      // Unreadable: the intro shows in full, the safe default for a learner.
      () => active && setDone(false),
    );
    return () => {
      active = false;
    };
    // Read once per lesson: finishing it here must not collapse the intro under the summary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, content]);
  if (done === null) return <SavingScreen title={LESSON_COPY.name} label="Cargando la lección" />;
  const unit =
    lesson === undefined
      ? null
      : {
          info: lesson,
          topic: lesson.topic,
          exercises,
          recap: lessonRecap(lesson, content),
          intro,
          introStart: attempt > 0 || done ? ("collapsed" as const) : ("full" as const),
        };
  return (
    <PracticeSession
      key={attempt}
      unit={unit}
      content={content}
      copy={
        place === undefined
          ? LESSON_COPY
          : { ...LESSON_COPY, done: `Volver a ${place.collectionTitle}` }
      }
      leaveTitle="¿Salir de la lección?"
      onDone={() => {
        if (place !== undefined) {
          if (router.canGoBack()) router.back();
          else router.replace(practiceCollectionPath(place.slug));
        } else if (router.canDismiss()) router.dismissAll();
        else router.replace("/");
      }}
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
  /** The lesson's theory ("Antes de empezar"); none: no intro. */
  readonly intro?: LessonIntro | null | undefined;
  /** full: the intro screen comes first; collapsed: a toggle above the first exercise. */
  readonly introStart?: "full" | "collapsed" | undefined;
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
  const intro = unit?.intro ?? null;
  // The intro screen before the first exercise, and its reopening from the summary.
  const [introShown, setIntroShown] = useState(intro !== null && unit?.introStart === "full");
  const [theoryOpen, setTheoryOpen] = useState(false);
  const achievements = useNewAchievements(save.status === "saved", content);
  const topic = unit?.topic;

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: canLeave, headerBackVisible: canLeave }} />
      <SessionGlossary content={content} topic={topic} onLookupItems={onLookup}>
        <LessonView
          state={withIntro(
            withAchievements(
              toViewState(session, initial?.prepared ?? [], save, content, topic, unit?.recap),
              achievements,
            ),
            intro === null
              ? null
              : {
                  intro,
                  title: unit?.info.title ?? "",
                  collapsed: unit?.introStart === "collapsed",
                  shown: introShown,
                  theoryOpen,
                },
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
          onStart={() => setIntroShown(false)}
          onToggleTheory={() => setTheoryOpen((open) => !open)}
        />
      </SessionGlossary>
      {dialog}
    </>
  );
}

type SessionIntro = {
  readonly intro: LessonIntro;
  /** The lesson's title, for the intro reopened from the summary. */
  readonly title: string;
  /** A redo or a done lesson: the intro waits collapsed above the first exercise. */
  readonly collapsed: boolean;
  /** The intro screen comes before the first exercise (until "Empezar"). */
  readonly shown: boolean;
  /** Reopened from the summary ("Ver teoría"). */
  readonly theoryOpen: boolean;
};

/**
 * The lesson's intro over the session: its screen before the first exercise (`shown`) or when
 * reopened from the summary (`theoryOpen`), the summary's "Ver teoría", and the collapsed toggle
 * above the first exercise of a redo or a done lesson.
 */
function withIntro(state: LessonViewState, intro: SessionIntro | null): LessonViewState {
  if (intro === null) return state;
  if (state.status === "exercise") {
    if (intro.shown) {
      return {
        status: "intro",
        title: state.title,
        topic: state.topic,
        intro: intro.intro,
        action: "start",
      };
    }
    return intro.collapsed && state.position === 1 ? { ...state, intro: intro.intro } : state;
  }
  if (state.status === "summary") {
    if (!intro.theoryOpen) return { ...state, hasIntro: true };
    return {
      status: "intro",
      title: intro.title,
      topic: state.topic,
      intro: intro.intro,
      action: "back",
    };
  }
  return state;
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
      dailyGoal: save.dailyGoal,
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
