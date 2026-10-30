import { LEVELS, type Level } from "@english-learn/domain";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { ExerciseBody } from "@/features/lesson/components/exercise-body";
import type { PreparedExercise } from "@/features/lesson/model/prepare-exercise";
import type { ExerciseResponse } from "@/features/lesson/model/response";
import { SessionMessage } from "@/features/lesson/components/session-screens";
import { levelHighlighter } from "@/features/topics/topic-colors";
import { Button } from "@/shared/ui/button";
import { Highlight } from "@/shared/ui/highlight";
import { ProgressLine } from "@/shared/ui/progress-line";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";

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
  const styles = useStyles();
  const { colors } = useTheme();
  switch (state.status) {
    case "intro":
      // The first page of the notebook: what this is, how long it takes, and a way in.
      return (
        <ScreenContainer title={TITLE}>
          <Text variant="title">
            Responde de 15 a 20 preguntas cortas para estimar tu nivel de inglés (de A1 a C1).
          </Text>
          <View style={styles.paragraphs}>
            <Text>
              Te llevará unos 5 minutos. El test se adapta a tus respuestas: si aciertas, las
              preguntas se vuelven más difíciles.
            </Text>
            <Text>
              No verás si aciertas cada pregunta. Si no sabes una respuesta, elige la que te parezca
              más probable.
            </Text>
          </View>
          <Button label="Empezar" onPress={onStart} />
        </ScreenContainer>
      );
    case "question":
      return (
        <ScreenContainer
          top={
            <View style={styles.progress}>
              <ProgressLine
                value={state.number - 1}
                max={state.maxQuestions}
                label="Progreso del test"
              />
              <Text variant="small" tone="muted">
                {`Pregunta ${state.number} de hasta ${state.maxQuestions}`}
              </Text>
            </View>
          }
        >
          <ExerciseBody
            key={state.prepared.exercise.id}
            prepared={state.prepared}
            passage={undefined}
            disabled={false}
            submitLabel="Siguiente"
            onSubmit={onSubmit}
          />
        </ScreenContainer>
      );
    case "saving":
      return (
        <ScreenContainer title={TITLE}>
          <ActivityIndicator accessibilityLabel="Guardando tu resultado" color={colors.ink} />
        </ScreenContainer>
      );
    case "save-error":
      return (
        <SessionMessage
          title={TITLE}
          text="No pudimos guardar tu resultado."
          onRetry={onRetrySave}
        />
      );
    case "result":
      return (
        <ScreenContainer title={TITLE}>
          <View
            accessible
            accessibilityLabel={`Tu nivel estimado: ${state.level}`}
            style={styles.level}
          >
            <Text variant="title" tone="muted">
              Tu nivel estimado
            </Text>
            <Highlight
              variant="hero"
              shape="swipe"
              color={levelHighlighter(state.level)}
              style={styles.levelValue}
            >
              {state.level}
            </Highlight>
          </View>
          <View style={styles.paragraphs}>
            <Text variant="bodyStrong">{LEVEL_DESCRIPTIONS[state.level]}</Text>
            <Text>{lessonsNote(state)}</Text>
          </View>
          <Text variant="small" tone="muted">
            Es una estimación orientativa, no un certificado. Puedes repetir el test cuando quieras
            desde el inicio.
          </Text>
          <Button label="Ir a mis lecciones" onPress={onGoToLessons} />
        </ScreenContainer>
      );
  }
}

const useStyles = themedStyles(() =>
  StyleSheet.create({
    paragraphs: { gap: spacing.md },
    progress: { gap: spacing.sm },
    level: { gap: spacing.xs },
    levelValue: { fontSize: 72, lineHeight: 80 },
  }),
);
