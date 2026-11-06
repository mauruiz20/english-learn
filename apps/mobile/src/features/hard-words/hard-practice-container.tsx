import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import {
  classifyItems,
  hardPracticeProgress,
  type ItemDifficulty,
  type ProgressRepository,
} from "@english-learn/domain";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useNewAchievements } from "@/features/achievements/use-new-achievements";
import { cardPath } from "@/features/cards/card-routes";
import { cardByExerciseId } from "@/features/cards/model/card-catalog";
import { SessionGlossary } from "@/features/glossary/session-glossary";
import { completeSession } from "@/features/lesson/application/complete-session";
import { itemsToReview } from "@/features/lesson/model/items-to-review";
import {
  canDispute,
  startLesson,
  type LessonSessionState,
} from "@/features/lesson/model/lesson-session";
import { prepareExercise } from "@/features/lesson/model/prepare-exercise";
import { responseText } from "@/features/lesson/model/response";
import { sessionResults } from "@/features/lesson/model/session-results";
import {
  useExerciseSession,
  type ExerciseSession,
  type SaveState,
} from "@/features/lesson/use-exercise-session";
import { restrictToItems } from "@/features/review/model/review-plan";
import { ReviewView, type ReviewCopy, type ReviewViewState } from "@/features/review/review-view";
import { topicByExerciseId, topicByItemId } from "@/features/topics/topic-colors";
import { useAppServices } from "@/infrastructure/services/app-services";
import { useLeaveConfirmation } from "@/shared/navigation/leave-confirmation";
import { hardPracticeNote, planHardPractice, progressOverview } from "./model/hard-words";

const COPY: ReviewCopy = {
  title: "Palabras difíciles",
  loading: "Cargando tus palabras difíciles",
  loadError: "No pudimos cargar tus palabras difíciles.",
  emptyTitle: "No tienes palabras difíciles",
  emptyText: "Las palabras que fallas en tus repasos aparecen aquí para practicarlas.",
  summaryTitle: "¡Práctica completada!",
  doneLabel: "Volver a mi progreso",
};

const SESSION_INFO = { id: "hard-words", title: "Palabras difíciles" } as const;

type Plan = {
  readonly session: ExerciseSession;
  /** The difficult items the exercises cover: the ones saved. */
  readonly itemIds: readonly string[];
  /** Their difficulty before the practice (for the summary's line). */
  readonly before: readonly ItemDifficulty[];
};

type Load =
  | { readonly status: "loading" | "load-error" | "empty" }
  | { readonly status: "ready"; readonly plan: Plan };

async function readDifficulty(repository: ProgressRepository, content: Corpus) {
  const [states, histories] = await Promise.all([
    repository.getReviewStates(),
    repository.getItemHistories(),
  ]);
  return { states, histories, overview: progressOverview({ states, histories, content }) };
}

/**
 * "Practicar mis palabras difíciles": up to 10 exercises over the difficult words (hardest first),
 * picked like the daily review, played and saved like a review (`kind: "review"`, answer XP
 * only). Every practiced difficult word is saved, due or not: the fold's `applyReview` advances
 * only a due item; a word not due yet keeps its schedule when answered right (the answer still
 * counts in its history) and lapses when answered wrong, as in any review or lesson replay.
 */
export function HardPracticeContainer({ content = corpus }: { content?: Corpus }) {
  const { progressRepository, random } = useAppServices();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let active = true;
    readDifficulty(progressRepository, content).then(
      ({ states, histories, overview }) => {
        if (!active) return;
        const { itemIds, exercises } = planHardPractice({
          hardItemIds: overview.hardWords.map((w) => w.itemId),
          exercises: content.exercises,
          rng: random,
        });
        if (exercises.length === 0) {
          setLoad({ status: "empty" });
          return;
        }
        setLoad({
          status: "ready",
          plan: {
            itemIds,
            before: classifyItems(states, histories),
            session: {
              state: startLesson(SESSION_INFO, exercises),
              prepared: exercises.map((e) => prepareExercise(e, random)),
            },
          },
        });
      },
      (error: unknown) => {
        if (!active) return;
        console.error("Failed to load the hard words practice", error);
        setLoad({ status: "load-error" });
      },
    );
    return () => {
      active = false;
    };
    // Planned once per mount: re-planning mid-session would reshuffle the exercises.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/progreso"));

  if (load.status !== "ready") {
    return <ReviewView state={load} {...noSession} copy={COPY} onGoHome={goBack} />;
  }
  return (
    <HardPracticeSession
      plan={load.plan}
      content={content}
      onDone={goBack}
      onOpenCard={(cardId) => router.push(cardPath(cardId, { fromSession: true }))}
    />
  );
}

const noop = () => {};
const noSession = { onSubmit: noop, onContinue: noop, onDispute: noop, onRetrySave: noop };

function HardPracticeSession({
  plan,
  content,
  onDone,
  onOpenCard,
}: {
  plan: Plan;
  content: Corpus;
  onDone: () => void;
  onOpenCard: (cardId: string) => void;
}) {
  const { progressRepository, clock, randomBytes, deviceId } = useAppServices();
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
    initial: plan.session,
    complete: (summary) =>
      completeSession({
        repository: progressRepository,
        summary: restrictToItems(summary, plan.itemIds),
        today: clock.today(),
        nowMs: clock.nowMs(),
        randomBytes,
        deviceId,
        kind: "review",
      }),
  });
  const { dialog } = useLeaveConfirmation(hasUnsavedAnswers, "¿Salir de la práctica?");
  const achievements = useNewAchievements(save.status === "saved", content);
  const note = useProgressNote(save.status === "saved", plan, content);
  const viewState = toViewState(session, plan, save, content);
  const state =
    viewState.status === "summary"
      ? {
          ...viewState,
          ...(achievements.length > 0 ? { achievements } : {}),
          ...(note === undefined ? {} : { note }),
        }
      : viewState;

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: canLeave, headerBackVisible: canLeave }} />
      <SessionGlossary
        content={content}
        topic={state.status === "exercise" ? state.topic : undefined}
        onLookupItems={onLookup}
      >
        <ReviewView
          state={state}
          copy={COPY}
          onSubmit={onSubmit}
          onContinue={onContinue}
          onDispute={onDispute}
          onGoHome={onDone}
          onRetrySave={retrySave}
          onOpenCard={onOpenCard}
        />
      </SessionGlossary>
      {dialog}
    </>
  );
}

/**
 * Once saved, how many of the practiced difficult words left Difíciles ("2 de 5 palabras
 * difíciles avanzaron a En proceso."), or `undefined` until known. A failed read only costs the
 * line.
 */
function useProgressNote(saved: boolean, plan: Plan, content: Corpus): string | undefined {
  const { progressRepository } = useAppServices();
  const [note, setNote] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!saved) return;
    let active = true;
    readDifficulty(progressRepository, content).then(
      ({ states, histories }) => {
        if (!active) return;
        const after = classifyItems(states, histories);
        setNote(hardPracticeNote(hardPracticeProgress(plan.before, after, plan.itemIds)));
      },
      (error: unknown) => console.error("Failed to compare the difficult words", error),
    );
    return () => {
      active = false;
    };
  }, [saved, plan, progressRepository, content]);
  return note;
}

function toViewState(
  session: LessonSessionState | null,
  plan: Plan,
  save: SaveState,
  content: Corpus,
): ReviewViewState {
  if (session === null) return { status: "empty" };
  if (session.status === "finished") {
    if (save.status === "error") return { status: "save-error" };
    if (save.status !== "saved") return { status: "saving" };
    const { verdicts } = session.summary;
    return {
      status: "summary",
      correct: verdicts.filter((v) => v === "correct").length,
      total: verdicts.length,
      xpEarned: save.xpEarned,
      streakDays: save.streakDays,
      streakIncreased: save.streakIncreased,
      toReview: itemsToReview(
        restrictToItems(session.summary, plan.itemIds).itemOutcomes,
        content.itemsById,
        { topics: topicByItemId(content) },
      ),
    };
  }
  const prepared = plan.session.prepared[session.index];
  if (prepared === undefined) return { status: "empty" };
  return {
    status: "exercise",
    position: session.index + 1,
    total: session.exercises.length,
    topic: topicByExerciseId(content).get(prepared.exercise.id),
    prepared,
    feedback:
      session.status === "feedback"
        ? {
            ...session.feedback,
            given: responseText(session.response),
            disputable: canDispute(session),
          }
        : null,
    results: sessionResults(session),
    card: cardByExerciseId(content).get(prepared.exercise.id),
  };
}
