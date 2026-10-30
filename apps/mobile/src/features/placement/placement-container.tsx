import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import {
  LEVELS,
  answer,
  createPlacementSession,
  currentQuestion,
  placementResult,
  type PlacementOutcome,
  type PlacementSession,
} from "@english-learn/domain";
import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { gradeExercise } from "@/features/lesson/model/grade-exercise";
import { lessonLevelFor } from "@/features/lesson/model/lesson-catalog";
import { prepareExercise, type PreparedExercise } from "@/features/lesson/model/prepare-exercise";
import type { ExerciseResponse } from "@/features/lesson/model/response";
import { useAppServices, useSoundPlayer } from "@/infrastructure/services/app-services";
import { useLeaveConfirmation } from "@/shared/navigation/leave-confirmation";
import { savePlacement } from "./application/save-placement";
import { placementExercise, toPlacementCandidate } from "./model/placement-bank";
import { PlacementView, type PlacementViewState } from "./placement-view";

/** Upper bound of the adaptive test (the domain stops earlier once the estimate is precise). */
export const PLACEMENT_MAX_QUESTIONS = 20;

type Phase =
  | { readonly status: "intro" }
  | {
      readonly status: "question";
      readonly session: PlacementSession;
      readonly prepared: PreparedExercise;
    }
  | { readonly status: "saving" | "save-error" | "saved"; readonly outcome: PlacementOutcome };

/**
 * Runs the adaptive placement test: no per-question feedback, then saves the estimated level.
 * It only appends a `placement_completed` event (never reviews, XP or streak); the latest wins.
 */
export function PlacementContainer({ content = corpus }: { content?: Corpus }) {
  const { progressRepository, clock, random, randomBytes, deviceId } = useAppServices();
  const sounds = useSoundPlayer();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ status: "intro" });
  const saving = useRef(false);

  const questionsById = useMemo(() => new Map(content.placement.map((q) => [q.id, q])), [content]);
  const maxQuestions = Math.min(PLACEMENT_MAX_QUESTIONS, content.placement.length);
  const { dialog } = useLeaveConfirmation(
    phase.status === "question" && phase.session.answers.length > 0,
    "¿Salir del test de nivel?",
  );

  const ask = (session: PlacementSession): Phase | null => {
    const candidate = currentQuestion(session);
    const question = candidate === null ? undefined : questionsById.get(candidate.id);
    if (question === undefined) return null;
    return {
      status: "question",
      session,
      prepared: prepareExercise(placementExercise(question), random),
    };
  };

  const save = (outcome: PlacementOutcome) => {
    if (saving.current) return;
    saving.current = true;
    setPhase({ status: "saving", outcome });
    savePlacement({
      repository: progressRepository,
      outcome,
      today: clock.today(),
      nowMs: clock.nowMs(),
      randomBytes,
      deviceId,
    })
      .then(() => {
        setPhase({ status: "saved", outcome });
        sounds.play("complete");
      })
      .catch((error: unknown) => {
        console.error("Failed to save the placement result", error);
        saving.current = false;
        setPhase({ status: "save-error", outcome });
      });
  };

  const onStart = () => {
    const session = createPlacementSession({
      candidates: content.placement.map(toPlacementCandidate),
      maxQuestions: PLACEMENT_MAX_QUESTIONS,
      rng: random,
    });
    const next = ask(session);
    if (next !== null) setPhase(next);
  };

  const onSubmit = (response: ExerciseResponse) => {
    if (phase.status !== "question") return;
    const { session, prepared } = phase;
    const correct = gradeExercise(prepared.exercise, response).verdict === "correct";
    const nextSession = answer(session, prepared.exercise.id, correct, random);
    const next = ask(nextSession);
    if (next !== null) setPhase(next);
    else save(placementResult(nextSession));
  };

  const onRetrySave = () => {
    if (phase.status === "save-error") save(phase.outcome);
  };

  const onGoToLessons = () => (router.canDismiss() ? router.dismissAll() : router.replace("/"));

  return (
    <>
      <PlacementView
        state={toViewState(phase, maxQuestions, content)}
        onStart={onStart}
        onSubmit={onSubmit}
        onRetrySave={onRetrySave}
        onGoToLessons={onGoToLessons}
      />
      {dialog}
    </>
  );
}

function toViewState(phase: Phase, maxQuestions: number, content: Corpus): PlacementViewState {
  switch (phase.status) {
    case "intro":
      return { status: "intro" };
    case "question":
      return {
        status: "question",
        number: phase.session.answers.length + 1,
        maxQuestions,
        prepared: phase.prepared,
      };
    case "saving":
    case "save-error":
      return { status: phase.status };
    case "saved": {
      const withLessons = new Set(content.lessons.map((l) => l.level));
      return {
        status: "result",
        level: phase.outcome.level,
        lessonLevel: lessonLevelFor(content.lessons, phase.outcome.level),
        lessonLevels: LEVELS.filter((level) => withLessons.has(level)),
      };
    }
  }
}
