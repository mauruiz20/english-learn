import type { Passage } from "@english-learn/content";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button } from "@/shared/ui/button";
import { formatDays } from "@/shared/ui/format";
import { Screen } from "@/shared/ui/screen";
import { colors, radius, spacing } from "@/shared/ui/theme";
import { AnswerFeedback } from "./components/answer-feedback";
import { ExerciseBody } from "./components/exercise-body";
import type { GradeResult } from "./model/grade-exercise";
import type { PreparedExercise } from "./model/prepare-exercise";
import type { ExerciseResponse } from "./model/response";

export type LessonViewState =
  | { readonly status: "not-found" }
  | {
      readonly status: "exercise";
      readonly title: string;
      /** 1-based position of the current exercise. */
      readonly position: number;
      readonly total: number;
      readonly prepared: PreparedExercise;
      /** The passage of a reading exercise. */
      readonly passage: Passage | undefined;
      /** Set once the learner answered the current exercise. */
      readonly feedback: GradeResult | null;
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

type LessonViewProps = {
  state: LessonViewState;
  onSubmit: (response: ExerciseResponse) => void;
  onContinue: () => void;
  onGoHome: () => void;
  onRetrySave: () => void;
};

function Message({
  text,
  onRetry,
  onGoHome,
}: {
  text: string;
  onRetry?: () => void;
  onGoHome: () => void;
}) {
  return (
    <>
      <Text accessibilityRole="alert" style={styles.error}>
        {text}
      </Text>
      {onRetry !== undefined && <Button label="Reintentar" onPress={onRetry} />}
      <Button
        label="Volver al inicio"
        variant={onRetry === undefined ? "primary" : "secondary"}
        onPress={onGoHome}
      />
    </>
  );
}

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
        <Screen title="Lección">
          <Message text="No encontramos esta lección." onGoHome={onGoHome} />
        </Screen>
      );
    case "save-error":
      return (
        <Screen title="Lección">
          <Message
            text="No pudimos guardar tu progreso."
            onRetry={onRetrySave}
            onGoHome={onGoHome}
          />
        </Screen>
      );
    case "saving":
      return (
        <Screen title="Lección">
          <ActivityIndicator accessibilityLabel="Guardando tu progreso" color={colors.primary} />
        </Screen>
      );
    case "summary":
      return (
        <Screen title="¡Lección completada!">
          <View style={styles.card}>
            <Text style={styles.stat}>{`Aciertos: ${state.correct} de ${state.total}`}</Text>
            <Text style={styles.stat}>{`XP ganada: ${state.xpEarned}`}</Text>
            <Text style={styles.stat}>{`Racha: ${formatDays(state.streakDays)}`}</Text>
          </View>
          <Button label="Volver al inicio" onPress={onGoHome} />
        </Screen>
      );
    case "exercise":
      return (
        <Screen title={state.title}>
          <Text style={styles.progress}>{`Ejercicio ${state.position} de ${state.total}`}</Text>
          <ExerciseBody
            key={state.prepared.exercise.id}
            prepared={state.prepared}
            passage={state.passage}
            disabled={state.feedback !== null}
            onSubmit={onSubmit}
          />
          {state.feedback !== null && (
            <AnswerFeedback
              verdict={state.feedback.verdict}
              correctAnswer={state.feedback.correctAnswer}
              onContinue={onContinue}
            />
          )}
        </Screen>
      );
  }
}

const styles = StyleSheet.create({
  progress: { fontSize: 15, color: colors.textMuted },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stat: { fontSize: 18, fontWeight: "600", color: colors.text },
  error: { fontSize: 16, color: colors.danger },
});
