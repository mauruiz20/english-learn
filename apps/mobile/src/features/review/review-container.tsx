import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { completeSession } from "@/features/lesson/application/complete-session";
import { itemsToReview } from "@/features/lesson/model/items-to-review";
import { startLesson, type LessonSessionState } from "@/features/lesson/model/lesson-session";
import { prepareExercise } from "@/features/lesson/model/prepare-exercise";
import { responseText } from "@/features/lesson/model/response";
import {
  useExerciseSession,
  type ExerciseSession,
  type SaveState,
} from "@/features/lesson/use-exercise-session";
import { SessionGlossary } from "@/features/glossary/session-glossary";
import { topicByExerciseId, topicByItemId } from "@/features/topics/topic-colors";
import { useAppServices } from "@/infrastructure/services/app-services";
import { useLeaveConfirmation } from "@/shared/navigation/leave-confirmation";
import { pendingReviewItems, pickReviewExercises, restrictToItems } from "./model/review-plan";
import { ReviewView, type ReviewViewState } from "./review-view";

type Plan = { readonly session: ExerciseSession; readonly itemIds: readonly string[] };

type Load =
  | { readonly status: "loading" | "load-error" | "empty" }
  | { readonly status: "ready"; readonly plan: Plan };

const REVIEW_INFO = { id: "review", title: "Repaso" } as const;

/** Loads today's due items, then runs the review session (see `ReviewSession`). */
export function ReviewContainer({ content = corpus }: { content?: Corpus }) {
  const { progressRepository, clock, random } = useAppServices();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let active = true;
    progressRepository.getReviewStates().then(
      (states) => {
        if (!active) return;
        const itemIds = pendingReviewItems({
          states,
          today: clock.today(),
          exercises: content.exercises,
        });
        const exercises = pickReviewExercises({
          itemIds,
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
            session: {
              state: startLesson(REVIEW_INFO, exercises),
              prepared: exercises.map((e) => prepareExercise(e, random)),
            },
          },
        });
      },
      (error: unknown) => {
        if (!active) return;
        console.error("Failed to load the review", error);
        setLoad({ status: "load-error" });
      },
    );
    return () => {
      active = false;
    };
    // Planned once per mount: re-planning mid-session would reshuffle the exercises.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goHome = () => (router.canDismiss() ? router.dismissAll() : router.replace("/"));

  if (load.status !== "ready") {
    return <ReviewView state={load} {...noSession} onGoHome={goHome} />;
  }
  return <ReviewSession plan={load.plan} content={content} onGoHome={goHome} />;
}

const noop = () => {};
const noSession = { onSubmit: noop, onContinue: noop, onRetrySave: noop };

/**
 * Runs the planned review with the lesson session flow and feedback, then saves it like a lesson
 * (worst grade per item, streak) but with answer XP only and only for the due items.
 */
function ReviewSession({
  plan,
  content,
  onGoHome,
}: {
  plan: Plan;
  content: Corpus;
  onGoHome: () => void;
}) {
  const { progressRepository, clock } = useAppServices();
  const { session, save, onSubmit, onContinue, onLookup, retrySave, canLeave, hasUnsavedAnswers } =
    useExerciseSession({
      initial: plan.session,
      complete: (summary) =>
        completeSession({
          repository: progressRepository,
          summary: restrictToItems(summary, plan.itemIds),
          today: clock.today(),
          bonus: "none",
        }),
    });
  const { dialog } = useLeaveConfirmation(hasUnsavedAnswers, "¿Salir del repaso?");
  const state = toViewState(session, plan, save, content);

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
          onSubmit={onSubmit}
          onContinue={onContinue}
          onGoHome={onGoHome}
          onRetrySave={retrySave}
        />
      </SessionGlossary>
      {dialog}
    </>
  );
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
      // Only the due items, like the saved results.
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
        ? { ...session.feedback, given: responseText(session.response) }
        : null,
  };
}
