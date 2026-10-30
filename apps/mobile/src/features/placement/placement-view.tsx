import { LEVELS, type Level } from "@english-learn/domain";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { ExerciseBody } from "@/features/lesson/components/exercise-body";
import type { PreparedExercise } from "@/features/lesson/model/prepare-exercise";
import type { ExerciseResponse } from "@/features/lesson/model/response";
import { Button } from "@/shared/ui/button";
import { Screen } from "@/shared/ui/screen";
import { colors, radius, spacing } from "@/shared/ui/theme";

export type PlacementViewState =
  | { readonly status: "intro" }
  | {
      readonly status: "question";
      /** 1-based number of the current question. */
      readonly number: number;
      /** Upper bound of the adaptive test (it may stop earlier). */
      readonly maxQuestions: number;
      readonly prepared: PreparedExercise;
    }
  | { readonly status: "saving" }
  | { readonly status: "save-error" }
  | {
      readonly status: "result";
      readonly level: Level;
      /** Level whose lessons the learner will see on home. */
      readonly lessonLevel: Level;
      /** Levels that have lessons, in CEFR order. */
      readonly lessonLevels: readonly Level[];
    };

type PlacementViewProps = {
  state: PlacementViewState;
  onStart: () => void;
  onSubmit: (response: ExerciseResponse) => void;
  onRetrySave: () => void;
  onGoToLessons: () => void;
};

const TITLE = "Test de nivel";

/** Short Spanish description of each CEFR level. */
const LEVEL_DESCRIPTIONS: Readonly<Record<Level, string>> = {
  A1: "Principiante: entiendes y usas expresiones cotidianas muy básicas.",
  A2: "Elemental: te comunicas en situaciones sencillas y habituales sobre temas conocidos.",
  B1: "Intermedio: te desenvuelves en la mayoría de situaciones cotidianas y de viaje, y hablas de experiencias y planes.",
  B2: "Intermedio alto: entiendes textos complejos y conversas con fluidez sobre muchos temas.",
  C1: "Avanzado: te expresas con fluidez y precisión, y entiendes textos largos y exigentes.",
};

function joinLevels(levels: readonly Level[]): string {
  if (levels.length <= 1) return levels.join("");
  return `${levels.slice(0, -1).join(", ")} y ${levels[levels.length - 1]}`;
}

function lessonsNote({
  level,
  lessonLevel,
  lessonLevels,
}: Extract<PlacementViewState, { status: "result" }>): string {
  if (level === lessonLevel) return `Te mostraremos las lecciones de nivel ${lessonLevel}.`;
  const reason =
    LEVELS.indexOf(level) < LEVELS.indexOf(lessonLevel)
      ? "Son las más cercanas a tu nivel: repite las que te cuesten."
      : "Te servirán de repaso mientras añadimos contenido de tu nivel.";
  return `Por ahora hay lecciones de nivel ${joinLevels(lessonLevels)}. Te recomendamos las de nivel ${lessonLevel}. ${reason}`;
}

export function PlacementView({
  state,
  onStart,
  onSubmit,
  onRetrySave,
  onGoToLessons,
}: PlacementViewProps) {
  switch (state.status) {
    case "intro":
      return (
        <Screen title={TITLE}>
          <View style={styles.card}>
            <Text style={styles.body}>
              Responde de 15 a 20 preguntas cortas para estimar tu nivel de inglés (de A1 a C1).
            </Text>
            <Text style={styles.body}>
              Te llevará unos 5 minutos. El test se adapta a tus respuestas: si aciertas, las
              preguntas se vuelven más difíciles.
            </Text>
            <Text style={styles.body}>
              No verás si aciertas cada pregunta. Si no sabes una respuesta, elige la que te parezca
              más probable.
            </Text>
          </View>
          <Button label="Empezar" onPress={onStart} />
        </Screen>
      );
    case "question":
      return (
        <Screen title={TITLE}>
          <Text style={styles.progress}>
            {`Pregunta ${state.number} de hasta ${state.maxQuestions}`}
          </Text>
          <ExerciseBody
            key={state.prepared.exercise.id}
            prepared={state.prepared}
            passage={undefined}
            disabled={false}
            submitLabel="Siguiente"
            onSubmit={onSubmit}
          />
        </Screen>
      );
    case "saving":
      return (
        <Screen title={TITLE}>
          <ActivityIndicator accessibilityLabel="Guardando tu resultado" color={colors.primary} />
        </Screen>
      );
    case "save-error":
      return (
        <Screen title={TITLE}>
          <Text accessibilityRole="alert" style={styles.error}>
            No pudimos guardar tu resultado.
          </Text>
          <Button label="Reintentar" onPress={onRetrySave} />
        </Screen>
      );
    case "result":
      return (
        <Screen title={TITLE}>
          <View style={styles.card}>
            <Text style={styles.level}>{`Tu nivel estimado: ${state.level}`}</Text>
            <Text style={styles.body}>{LEVEL_DESCRIPTIONS[state.level]}</Text>
            <Text style={styles.body}>{lessonsNote(state)}</Text>
            <Text style={styles.note}>
              Es una estimación orientativa, no un certificado. Puedes repetir el test cuando
              quieras desde el inicio.
            </Text>
          </View>
          <Button label="Ir a mis lecciones" onPress={onGoToLessons} />
        </Screen>
      );
  }
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  progress: { fontSize: 15, color: colors.textMuted },
  level: { fontSize: 22, fontWeight: "700", color: colors.text },
  body: { fontSize: 16, lineHeight: 22, color: colors.text },
  note: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  error: { fontSize: 16, color: colors.danger },
});
