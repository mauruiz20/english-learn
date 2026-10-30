import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { AnswerFeedback } from "@/features/lesson/components/answer-feedback";
import { ExerciseBody } from "@/features/lesson/components/exercise-body";
import type { GradeResult } from "@/features/lesson/model/grade-exercise";
import type { PreparedExercise } from "@/features/lesson/model/prepare-exercise";
import type { ExerciseResponse } from "@/features/lesson/model/response";
import { Button } from "@/shared/ui/button";
import { formatDays } from "@/shared/ui/format";
import { Screen } from "@/shared/ui/screen";
import { colors, radius, spacing } from "@/shared/ui/theme";

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

type ReviewViewProps = {
  state: ReviewViewState;
  onSubmit: (response: ExerciseResponse) => void;
  onContinue: () => void;
  onGoHome: () => void;
  onRetrySave: () => void;
};

const TITLE = "Repaso";

function Alert({ text }: { text: string }) {
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {text}
    </Text>
  );
}

export function ReviewView({
  state,
  onSubmit,
  onContinue,
  onGoHome,
  onRetrySave,
}: ReviewViewProps) {
  const home = (variant: "primary" | "secondary" = "primary") => (
    <Button label="Volver al inicio" variant={variant} onPress={onGoHome} />
  );
  switch (state.status) {
    case "loading":
      return (
        <Screen title={TITLE}>
          <ActivityIndicator accessibilityLabel="Cargando tu repaso" color={colors.primary} />
        </Screen>
      );
    case "load-error":
      return (
        <Screen title={TITLE}>
          <Alert text="No pudimos cargar tu repaso." />
          {home()}
        </Screen>
      );
    case "empty":
      return (
        <Screen title={TITLE}>
          <View style={styles.card}>
            <Text style={styles.stat}>Nada para repasar hoy</Text>
            <Text style={styles.body}>
              Las palabras que aprendes en las lecciones vuelven aquí cuando toca repasarlas.
            </Text>
          </View>
          {home()}
        </Screen>
      );
    case "saving":
      return (
        <Screen title={TITLE}>
          <ActivityIndicator accessibilityLabel="Guardando tu progreso" color={colors.primary} />
        </Screen>
      );
    case "save-error":
      return (
        <Screen title={TITLE}>
          <Alert text="No pudimos guardar tu progreso." />
          <Button label="Reintentar" onPress={onRetrySave} />
          {home("secondary")}
        </Screen>
      );
    case "summary":
      return (
        <Screen title="¡Repaso completado!">
          <View style={styles.card}>
            <Text style={styles.stat}>{`Aciertos: ${state.correct} de ${state.total}`}</Text>
            <Text style={styles.stat}>{`XP ganada: ${state.xpEarned}`}</Text>
            <Text style={styles.stat}>{`Racha: ${formatDays(state.streakDays)}`}</Text>
          </View>
          {home()}
        </Screen>
      );
    case "exercise":
      return (
        <Screen title={TITLE}>
          <Text style={styles.progress}>{`Ejercicio ${state.position} de ${state.total}`}</Text>
          <ExerciseBody
            key={state.prepared.exercise.id}
            prepared={state.prepared}
            passage={undefined}
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
  body: { fontSize: 16, lineHeight: 22, color: colors.textMuted },
  error: { fontSize: 16, color: colors.danger },
});
