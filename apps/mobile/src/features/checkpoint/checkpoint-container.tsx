import { checkpointAvailable, type CheckpointEvidence } from "@english-learn/domain";
import {
  INTRODUCTIONS_CHECKPOINT_EXERCISES,
  INTRODUCTIONS_CHECKPOINT_QUESTIONS,
} from "@english-learn/content";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { CHECKPOINT_ID, SOURCE_LESSON_ID } from "./checkpoint-config";
import { useCheckpointEligibility } from "./use-checkpoint-eligibility";
import { useAppServices } from "@/infrastructure/services/app-services";
import { ExerciseBody } from "@/features/lesson/components/exercise-body";
import { lessonSessionReducer, startLesson } from "@/features/lesson/model/lesson-session";
import { prepareExercise } from "@/features/lesson/model/prepare-exercise";
import { newEventId } from "@/features/progress/progress-events";
import { Button } from "@/shared/ui/button";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import { themedStyles } from "@/shared/ui/use-theme";

/** The direct route and the home entry share this storage gate; the route never trusts its caller. */
export function CheckpointContainer() {
  const { progressRepository, clock, random, randomBytes, deviceId } = useAppServices();
  const router = useRouter();
  const { eligibility, retryEligibility } = useCheckpointEligibility();
  const [session, setSession] = useState(() =>
    startLesson(
      { id: CHECKPOINT_ID, title: "Comprobación de presentaciones" },
      INTRODUCTIONS_CHECKPOINT_EXERCISES,
    ),
  );
  const [prepared] = useState(() =>
    INTRODUCTIONS_CHECKPOINT_EXERCISES.map((exercise) => prepareExercise(exercise, random)),
  );
  const [saving, setSaving] = useState(false);
  const [savedEvidence, setSavedEvidence] = useState<CheckpointEvidence | null>(null);
  const [saveError, setSaveError] = useState(false);
  const savingRef = useRef(false);

  const openSourceLesson = () => router.replace(`/lesson/${SOURCE_LESSON_ID}`);
  const styles = useStyles();

  if (eligibility.status === "loading") {
    return (
      <ScreenContainer title="Comprobación de presentaciones">
        <ActivityIndicator accessibilityLabel="Cargando comprobación" />
      </ScreenContainer>
    );
  }
  if (eligibility.status === "error") {
    return (
      <ScreenContainer title="Comprobación de presentaciones">
        <Text tone="redPen" accessibilityRole="alert">
          No pudimos consultar si ya puedes hacer la comprobación.
        </Text>
        <Button label="Reintentar" onPress={retryEligibility} />
      </ScreenContainer>
    );
  }
  if (eligibility.status === "missing") {
    return (
      <ScreenContainer title="Comprobación de presentaciones">
        <Text tone="muted">
          La comprobación estará disponible 24 horas después de completar la lección «¿Cómo te
          llamas?».
        </Text>
        <Button label="Abrir la lección «¿Cómo te llamas?»" onPress={openSourceLesson} />
      </ScreenContainer>
    );
  }
  if (eligibility.status === "waiting") {
    return (
      <ScreenContainer title="Comprobación de presentaciones">
        <Text tone="muted">
          La comprobación estará disponible cuando hayan pasado 24 horas desde la lección.
        </Text>
      </ScreenContainer>
    );
  }
  if (eligibility.status === "completed") {
    return <ResultScreen evidence={eligibility.evidence} onGoHome={() => router.replace("/")} />;
  }
  if (savedEvidence !== null) {
    return <ResultScreen evidence={savedEvidence} onGoHome={() => router.replace("/")} />;
  }

  const current = session.status === "finished" ? null : (prepared[session.index] ?? null);
  const correct =
    session.status === "finished"
      ? session.summary.verdicts.filter((verdict) => verdict === "correct").length
      : null;
  const contextEs =
    session.status === "finished"
      ? undefined
      : INTRODUCTIONS_CHECKPOINT_QUESTIONS[session.index]?.contextEs;

  const saveResult = async () => {
    if (session.status !== "finished" || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      const evidence = await progressRepository.getCheckpointEvidence(
        CHECKPOINT_ID,
        SOURCE_LESSON_ID,
      );
      if (!checkpointAvailable(evidence, clock.nowMs())) {
        if (evidence.result !== null) setSavedEvidence(evidence);
        else {
          setSaveError(true);
          retryEligibility();
        }
        return;
      }
      const occurredAt = clock.nowMs();
      const localDate = clock.today();
      const stamp = { deviceId, occurredAt, localDate, randomBytes };
      await progressRepository.appendEvents([
        {
          id: newEventId(stamp),
          deviceId,
          occurredAt,
          localDate,
          type: "checkpoint_completed",
          payload: {
            v: 1,
            checkpointId: CHECKPOINT_ID,
            lessonId: SOURCE_LESSON_ID,
            correct: correct ?? 0,
            total: 3,
          },
        },
      ]);
      setSavedEvidence({
        completedAt: evidence.completedAt,
        result: {
          correct: correct ?? 0,
          total: 3,
          occurredAt,
          localDate,
        },
      });
    } catch {
      setSaveError(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (session.status === "finished") {
    return (
      <ScreenContainer title="Comprobación de presentaciones">
        <View style={styles.summary}>
          <Text variant="heading">Resultado de tus respuestas</Text>
          <Text>{`${correct} de 3 respuestas correctas`}</Text>
          <Text tone="muted">Este resultado corresponde solo a esta comprobación.</Text>
          {saveError && (
            <Text tone="redPen" accessibilityRole="alert">
              No pudimos guardar el resultado.
            </Text>
          )}
          <Button
            label={saveError ? "Reintentar" : "Guardar resultado"}
            onPress={() => void saveResult()}
            disabled={saving}
          />
          {saving && <ActivityIndicator accessibilityLabel="Guardando resultado" />}
        </View>
      </ScreenContainer>
    );
  }

  if (session.status === "feedback") {
    const exercise = session.exercises[session.index];
    return (
      <ScreenContainer
        title="Comprobación de presentaciones"
        footer={
          <View style={styles.feedback}>
            <Text
              accessibilityRole="alert"
              tone={session.feedback.verdict === "correct" ? "success" : "redPen"}
            >
              {session.feedback.verdict === "correct" ? "Correcto" : "No es correcto"}
            </Text>
            {session.feedback.verdict !== "correct" && (
              <Text>{`Respuesta: ${session.feedback.correctAnswer}`}</Text>
            )}
            <Button
              label="Continuar"
              onPress={() => setSession((state) => lessonSessionReducer(state, { type: "next" }))}
            />
          </View>
        }
        footerTone={session.feedback.verdict}
      >
        {contextEs !== undefined && <Text>{contextEs}</Text>}
        <Text>{exercise?.type === "translation_choice" ? exercise.sentence : ""}</Text>
      </ScreenContainer>
    );
  }

  if (current === null) {
    return (
      <ScreenContainer title="Comprobación de presentaciones">
        <Text tone="redPen" accessibilityRole="alert">
          No encontramos las preguntas de esta comprobación.
        </Text>
        <Button label="Volver al inicio" onPress={() => router.replace("/")} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      title="Comprobación de presentaciones"
      top={<Text variant="smallStrong">{`Pregunta ${session.index + 1} de 3`}</Text>}
    >
      {contextEs !== undefined && <Text>{contextEs}</Text>}
      <ExerciseBody
        prepared={current}
        passage={undefined}
        disabled={false}
        onSubmit={(response) =>
          setSession((state) =>
            lessonSessionReducer(state, { type: "answer", response, responseMs: 0 }),
          )
        }
      />
    </ScreenContainer>
  );
}

function ResultScreen({
  evidence,
  onGoHome,
}: {
  evidence: CheckpointEvidence;
  onGoHome: () => void;
}) {
  const styles = useStyles();
  const result = evidence.result;
  if (result === null) return null;
  return (
    <ScreenContainer title="Comprobación de presentaciones">
      <View style={styles.summary}>
        <Text variant="heading">Resultado de la comprobación</Text>
        <Text>{`${result.correct} de 3 respuestas correctas`}</Text>
        <Text tone="muted">{`Fecha: ${formatDate(result.localDate)}`}</Text>
        <Button label="Volver al inicio" onPress={onGoHome} />
      </View>
    </ScreenContainer>
  );
}

function formatDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "long" }).format(
    new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 12)),
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    summary: { gap: spacing.md },
    feedback: { gap: spacing.sm, padding: spacing.md },
  }),
);
