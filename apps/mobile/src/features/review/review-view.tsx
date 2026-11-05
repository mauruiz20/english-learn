import type { Verdict } from "@english-learn/domain";
import { ActivityIndicator } from "react-native";
import { AnswerFeedback } from "@/features/lesson/components/answer-feedback";
import { ExerciseBody } from "@/features/lesson/components/exercise-body";
import {
  SavingScreen,
  SessionMessage,
  SessionProgress,
  SessionSummary,
} from "@/features/lesson/components/session-screens";
import { cardLink, type ExerciseCard, type ShownFeedback } from "@/features/lesson/lesson-view";
import type { ReviewNote } from "@/features/lesson/model/items-to-review";
import { answerIsEnglish } from "@/features/lesson/model/lookup-policy";
import type { PreparedExercise } from "@/features/lesson/model/prepare-exercise";
import type { ExerciseResponse } from "@/features/lesson/model/response";
import type { SessionPlumas } from "@/features/rewards/model/plumas-copy";
import { Button } from "@/shared/ui/button";
import { Doodle } from "@/shared/ui/doodle";
import { PageTurn } from "@/shared/ui/page-turn";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { useTheme } from "@/shared/ui/use-theme";
import { correctInARow } from "@/features/lesson/model/session-results";
import type { EarnedSticker } from "@/features/lesson/components/session-screens";

export type ReviewViewState =
  | { readonly status: "loading" }
  | { readonly status: "load-error" }
  | { readonly status: "empty" }
  | {
      readonly status: "exercise";
      /** 1-based position of the current exercise. */
      readonly position: number;
      readonly total: number;
      /** Topic of the lesson the current exercise comes from (named and colored above it). */
      readonly topic: string | undefined;
      readonly prepared: PreparedExercise;
      /** Set once the learner answered the current exercise. */
      readonly feedback: ShownFeedback | null;
      /** Verdicts of the exercises answered so far, in order (the shown answer included). */
      readonly results?: readonly Verdict[];
      /** The study card that explains this exercise, if any. */
      readonly card?: ExerciseCard | undefined;
    }
  | { readonly status: "saving" }
  | { readonly status: "save-error" }
  | {
      readonly status: "summary";
      readonly correct: number;
      readonly total: number;
      readonly xpEarned: number;
      /** Plumas the review earned and why. */
      readonly plumas?: SessionPlumas | undefined;
      readonly streakDays: number;
      /** This session extended the streak (the summary rolls the number). */
      readonly streakIncreased?: boolean;
      /** Items missed in the session, to look at again. */
      readonly toReview: readonly ReviewNote[];
      /** Album stickers the session earned. */
      readonly achievements?: readonly EarnedSticker[];
      /** Exercises later reviews will serve today (absent: not known yet). */
      readonly remaining?: number;
    };

type ReviewViewProps = {
  state: ReviewViewState;
  onSubmit: (response: ExerciseResponse) => void;
  onContinue: () => void;
  onDispute: () => void;
  onGoHome: () => void;
  onRetrySave: () => void;
  /** Opens a study card on top of the review ("Ver ficha"). */
  onOpenCard?: ((cardId: string) => void) | undefined;
};

const TITLE = "Repaso";

/** "Te quedan 25 para otro repaso.": more were due than one review holds. */
function remainingText(remaining: number | undefined): string | undefined {
  if (remaining === undefined || remaining <= 0) return undefined;
  return remaining === 1
    ? "Te queda 1 para otro repaso."
    : `Te quedan ${remaining} para otro repaso.`;
}

export function ReviewView({
  state,
  onSubmit,
  onContinue,
  onDispute,
  onGoHome,
  onRetrySave,
  onOpenCard,
}: ReviewViewProps) {
  const { colors } = useTheme();
  switch (state.status) {
    case "loading":
      return (
        <ScreenContainer title={TITLE}>
          <ActivityIndicator accessibilityLabel="Cargando tu repaso" color={colors.ink} />
        </ScreenContainer>
      );
    case "load-error":
      return (
        <SessionMessage title={TITLE} text="No pudimos cargar tu repaso." onGoHome={onGoHome} />
      );
    case "empty":
      return (
        <ScreenContainer title={TITLE}>
          <Doodle name="rest" />
          <Text variant="title">Nada para repasar hoy</Text>
          <Text tone="muted">
            Las palabras que aprendes en las lecciones vuelven aquí cuando toca repasarlas.
          </Text>
          <Button label="Volver al inicio" onPress={onGoHome} />
        </ScreenContainer>
      );
    case "saving":
      return <SavingScreen title={TITLE} label="Guardando tu progreso" />;
    case "save-error":
      return (
        <SessionMessage
          title={TITLE}
          text="No pudimos guardar tu progreso."
          onRetry={onRetrySave}
          onGoHome={onGoHome}
        />
      );
    case "summary":
      return (
        <SessionSummary
          title="¡Repaso completado!"
          {...state}
          next={remainingText(state.remaining)}
          onGoHome={onGoHome}
        />
      );
    case "exercise":
      return (
        <ScreenContainer
          top={
            <SessionProgress
              position={state.position}
              total={state.total}
              topic={state.topic}
              results={state.results}
            />
          }
          {...(state.feedback === null
            ? {}
            : {
                footerTone: state.feedback.verdict,
                footer: (
                  <AnswerFeedback
                    verdict={state.feedback.verdict}
                    given={state.feedback.given}
                    correctAnswer={state.feedback.correctAnswer}
                    diff={state.feedback.diff}
                    hint={state.feedback.hint}
                    disputed={state.feedback.disputed}
                    onDispute={state.feedback.disputable ? onDispute : undefined}
                    lookupAnswer={answerIsEnglish(state.prepared)}
                    inARow={correctInARow(state.results ?? [])}
                    card={cardLink(state.card, onOpenCard)}
                    finishes={state.position === state.total}
                    onContinue={onContinue}
                  />
                ),
              })}
        >
          <PageTurn pageKey={state.prepared.exercise.id}>
            <ExerciseBody
              key={state.prepared.exercise.id}
              prepared={state.prepared}
              passage={undefined}
              disabled={state.feedback !== null}
              reveal={state.feedback !== null}
              onSubmit={onSubmit}
            />
          </PageTurn>
        </ScreenContainer>
      );
  }
}
