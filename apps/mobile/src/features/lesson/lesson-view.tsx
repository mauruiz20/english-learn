import type { Passage } from "@english-learn/content";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { AnswerFeedback } from "./components/answer-feedback";
import { ExerciseBody } from "./components/exercise-body";
import {
  SavingScreen,
  SessionMessage,
  SessionProgress,
  SessionSummary,
} from "./components/session-screens";
import type { GradeResult } from "./model/grade-exercise";
import { answerIsEnglish } from "./model/lookup-policy";
import type { ReviewNote } from "./model/items-to-review";
import type { PreparedExercise } from "./model/prepare-exercise";
import type { ExerciseResponse } from "./model/response";

/** Feedback on the current answer, with the learner's answer as text. */
export type ShownFeedback = GradeResult & { readonly given: string };

export type LessonViewState =
  | { readonly status: "not-found" }
  | {
      readonly status: "exercise";
      readonly title: string;
      /** The lesson's topic slug (its highlighter tints the progress line and the title). */
      readonly topic: string | undefined;
      /** 1-based position of the current exercise. */
      readonly position: number;
      readonly total: number;
      readonly prepared: PreparedExercise;
      /** The passage of a reading exercise. */
      readonly passage: Passage | undefined;
      /** Set once the learner answered the current exercise. */
      readonly feedback: ShownFeedback | null;
    }
  | { readonly status: "saving" }
  | { readonly status: "save-error" }
  | {
      readonly status: "summary";
      readonly correct: number;
      readonly total: number;
      readonly xpEarned: number;
      readonly streakDays: number;
      /** Items missed in the session, to look at again. */
      readonly toReview: readonly ReviewNote[];
    };

type LessonViewProps = {
  state: LessonViewState;
  onSubmit: (response: ExerciseResponse) => void;
  onContinue: () => void;
  onGoHome: () => void;
  onRetrySave: () => void;
};

export function LessonView({
  state,
  onSubmit,
  onContinue,
  onGoHome,
  onRetrySave,
}: LessonViewProps) {
  switch (state.status) {
    case "not-found":
      return (
        <SessionMessage title="Lección" text="No encontramos esta lección." onGoHome={onGoHome} />
      );
    case "save-error":
      return (
        <SessionMessage
          title="Lección"
          text="No pudimos guardar tu progreso."
          onRetry={onRetrySave}
          onGoHome={onGoHome}
        />
      );
    case "saving":
      return <SavingScreen title="Lección" label="Guardando tu progreso" />;
    case "summary":
      return <SessionSummary title="¡Lección completada!" {...state} onGoHome={onGoHome} />;
    case "exercise":
      return (
        <ScreenContainer
          top={
            <SessionProgress
              position={state.position}
              total={state.total}
              title={state.title}
              topic={state.topic}
            />
          }
          {...(state.feedback === null
            ? {}
            : {
                footer: (
                  <AnswerFeedback
                    verdict={state.feedback.verdict}
                    given={state.feedback.given}
                    correctAnswer={state.feedback.correctAnswer}
                    lookupAnswer={answerIsEnglish(state.prepared)}
                    onContinue={onContinue}
                  />
                ),
              })}
        >
          <ExerciseBody
            key={state.prepared.exercise.id}
            prepared={state.prepared}
            passage={state.passage}
            disabled={state.feedback !== null}
            reveal={state.feedback !== null}
            onSubmit={onSubmit}
          />
        </ScreenContainer>
      );
  }
}
