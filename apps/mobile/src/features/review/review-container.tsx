import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { completeSession } from "@/features/lesson/application/complete-session";
import { cardPath } from "@/features/cards/card-routes";
import { itemsToReview } from "@/features/lesson/model/items-to-review";
import {
  canDispute,
  startLesson,
  type LessonSessionState,
} from "@/features/lesson/model/lesson-session";
import {
  contentExerciseId,
  listeningPool,
  mixListening,
  type SessionExercise,
} from "@/features/lesson/model/listen-exercise";
import { prepareExercise } from "@/features/lesson/model/prepare-exercise";
import { usePronunciation } from "@/features/pronunciation/pronunciation";
import { responseText } from "@/features/lesson/model/response";
import {
  useExerciseSession,
  type ExerciseSession,
  type SaveState,
} from "@/features/lesson/use-exercise-session";
import { cardByExerciseId } from "@/features/cards/model/card-catalog";
import { SessionGlossary } from "@/features/glossary/session-glossary";
import { topicByExerciseId, topicByItemId } from "@/features/topics/topic-colors";
import { useAppServices } from "@/infrastructure/services/app-services";
import { useLeaveConfirmation } from "@/shared/navigation/leave-confirmation";
import {
  listeningRng,
  planReview,
  reviewContext,
  restrictToItems,
  reviewOutlook,
  hasDeferredReviewExercises,
  REVIEW_MAX_EXERCISES_PER_DAY,
} from "./model/review-plan";
import { ReviewView, type ReviewViewState } from "./review-view";
import { sessionResults } from "@/features/lesson/model/session-results";
import { useNewAchievements } from "@/features/achievements/use-new-achievements";

type Plan = { readonly session: ExerciseSession; readonly itemIds: readonly string[] };

type Load =
  | { readonly status: "loading" | "load-error" }
  | { readonly status: "empty"; readonly reason: "no-due" | "daily-limit" }
  | { readonly status: "ready"; readonly plan: Plan };

const REVIEW_INFO = { id: "review", title: "Repaso" } as const;

/** Loads today's due items, then runs the review session (see `ReviewSession`). */
export function ReviewContainer({ content = corpus }: { content?: Corpus }) {
  const { progressRepository, clock, random } = useAppServices();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  // Read when the review is planned (once the stored switch is known): listening only when it
  // can be heard and is switched on.
  const { available: canListen, ready } = usePronunciation();

  useEffect(() => {
    if (!ready) return;
    let active = true;
    const today = clock.today();
    Promise.all([
      progressRepository.getReviewStates(),
      progressRepository.getDailyReviewExercises(today),
      progressRepository.getItemHistories(),
      progressRepository.getPlacementResult(),
    ]).then(
      ([states, reviewedExercises, histories, placement]) => {
        if (!active) return;
        // The same plan home counted (`reviewOutlook`): the day's rng picks the exercises.
        const remainingExercises = Math.max(0, REVIEW_MAX_EXERCISES_PER_DAY - reviewedExercises);
        const { itemIds, exercises: planned } = planReview({
          ...reviewContext(content, placement?.level ?? null, states),
          states,
          histories,
          today,
          exercises: content.exercises,
          remainingExercises,
        });
        // Up to two of them are heard instead of read (same items, same count: see
        // `mixListening`); the day's own rng, so it is the same all day.
        const exercises: readonly SessionExercise[] = canListen
          ? mixListening(planned, {
              pool: listeningPool({ exercises: content.exercises, cards: content.cards }),
              rng: listeningRng(today),
            })
          : planned;
        if (exercises.length === 0) {
          setLoad({
            status: "empty",
            reason: remainingExercises === 0 ? "daily-limit" : "no-due",
          });
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
    // Planned once per mount (`ready` only turns true once): re-planning mid-session would
    // reshuffle the exercises.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const goHome = () => (router.canDismiss() ? router.dismissAll() : router.replace("/"));

  if (load.status !== "ready") {
    return <ReviewView state={load} {...noSession} onGoHome={goHome} />;
  }
  return (
    <ReviewSession
      plan={load.plan}
      content={content}
      onGoHome={goHome}
      onOpenCard={(cardId) => router.push(cardPath(cardId, { fromSession: true }))}
    />
  );
}

const noop = () => {};
const noSession = { onSubmit: noop, onContinue: noop, onDispute: noop, onRetrySave: noop };

/**
 * Runs the planned review with the lesson session flow and feedback, then saves it like a lesson
 * (worst grade per item, streak) but with answer XP only and only for the due items.
 */
function ReviewSession({
  plan,
  content,
  onGoHome,
  onOpenCard,
}: {
  plan: Plan;
  content: Corpus;
  onGoHome: () => void;
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
  const { dialog } = useLeaveConfirmation(hasUnsavedAnswers, "¿Salir del repaso?");
  const achievements = useNewAchievements(save.status === "saved", content);
  const remaining = useRemainingReviews(save.status === "saved", content);
  const viewState = toViewState(session, plan, save, content);
  // The summary also announces the album stickers the review earned.
  const state =
    viewState.status === "summary"
      ? {
          ...viewState,
          ...(achievements.length > 0 ? { achievements } : {}),
          ...(remaining === null
            ? {}
            : { remaining: remaining.today, tomorrow: remaining.tomorrow }),
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
          onSubmit={onSubmit}
          onContinue={onContinue}
          onDispute={onDispute}
          onGoHome={onGoHome}
          onRetrySave={retrySave}
          onOpenCard={onOpenCard}
        />
      </SessionGlossary>
      {dialog}
    </>
  );
}

/**
 * Once the review is saved, what today's later reviews will serve (home's count after it), or
 * `null` until known. A failed read only costs the line.
 */
function useRemainingReviews(
  saved: boolean,
  content: Corpus,
): { today: number; tomorrow: boolean } | null {
  const { progressRepository, clock } = useAppServices();
  const [remaining, setRemaining] = useState<{ today: number; tomorrow: boolean } | null>(null);
  useEffect(() => {
    if (!saved) return;
    let active = true;
    const today = clock.today();
    Promise.all([
      progressRepository.getReviewStates(),
      progressRepository.getDailyReviewExercises(today),
      progressRepository.getItemHistories(),
      progressRepository.getPlacementResult(),
    ]).then(
      ([states, reviewedExercises, histories, placement]) => {
        if (!active) return;
        const input = {
          ...reviewContext(content, placement?.level ?? null, states),
          states,
          histories,
          today,
          exercises: content.exercises,
          remainingExercises: Math.max(0, REVIEW_MAX_EXERCISES_PER_DAY - reviewedExercises),
        };
        const { next, later } = reviewOutlook(input);
        setRemaining({ today: next + later, tomorrow: hasDeferredReviewExercises(input) });
      },
      (error: unknown) => console.error("Failed to count the remaining reviews", error),
    );
    return () => {
      active = false;
    };
  }, [saved, progressRepository, clock, content]);
  return remaining;
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
      dailyGoal: save.dailyGoal,
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
    topic: topicByExerciseId(content).get(contentExerciseId(prepared.exercise)),
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
    card: cardByExerciseId(content).get(contentExerciseId(prepared.exercise)),
  };
}
