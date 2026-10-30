import { ActivityIndicator } from "react-native";
import { AnswerFeedback } from "@/features/lesson/components/answer-feedback";
import { ExerciseBody } from "@/features/lesson/components/exercise-body";
import {
  SavingScreen,
  SessionMessage,
  SessionProgress,
  SessionSummary,
} from "@/features/lesson/components/session-screens";
import type { ShownFeedback } from "@/features/lesson/lesson-view";
import type { PreparedExercise } from "@/features/lesson/model/prepare-exercise";
import type { ExerciseResponse } from "@/features/lesson/model/response";
import { Button } from "@/shared/ui/button";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { useTheme } from "@/shared/ui/use-theme";

export type ReviewViewState =
  | { readonly status: "loading" }
  | { readonly status: "load-error" }
  | { readonly status: "empty" }
  | {
      readonly status: "exercise";
      /** 1-based position of the current exercise. */
      readonly position: number;
      readonly total: number;
      readonly prepared: PreparedExercise;
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
    };

type ReviewViewProps = {
  state: ReviewViewState;
  onSubmit: (response: ExerciseResponse) => void;
  onContinue: () => void;
  onGoHome: () => void;
  onRetrySave: () => void;
};

const TITLE = "Repaso";

export function ReviewView({
  state,
  onSubmit,
  onContinue,
  onGoHome,
  onRetrySave,
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
      return <SessionSummary title="¡Repaso completado!" {...state} onGoHome={onGoHome} />;
    case "exercise":
      return (
        <ScreenContainer
          top={<SessionProgress position={state.position} total={state.total} />}
          {...(state.feedback === null
            ? {}
            : {
                footer: (
                  <AnswerFeedback
                    verdict={state.feedback.verdict}
                    given={state.feedback.given}
                    correctAnswer={state.feedback.correctAnswer}
                    onContinue={onContinue}
                  />
                ),
              })}
        >
          <ExerciseBody
            key={state.prepared.exercise.id}
            prepared={state.prepared}
            passage={undefined}
            disabled={state.feedback !== null}
            onSubmit={onSubmit}
          />
        </ScreenContainer>
      );
  }
}
