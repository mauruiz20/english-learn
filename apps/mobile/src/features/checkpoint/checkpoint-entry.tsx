import { useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { CHECKPOINT_PATH, SOURCE_LESSON_ID } from "./checkpoint-config";
import { useCheckpointEligibility } from "./use-checkpoint-eligibility";
import { Button } from "@/shared/ui/button";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";

/** Persistent home entry; reads only checkpoint evidence and never infers baseline timestamps. */
export function CheckpointEntry() {
  const router = useRouter();
  const { eligibility, retryEligibility } = useCheckpointEligibility();

  const openSource = () => router.push(`/lesson/${SOURCE_LESSON_ID}`);
  const openCheckpoint = () => router.push(CHECKPOINT_PATH);
  const styles = useStyles();
  const { colors } = useTheme();

  return (
    <View style={styles.card}>
      <Text variant="title">Comprobación de presentaciones</Text>
      {eligibility.status === "loading" && (
        <ActivityIndicator accessibilityLabel="Cargando comprobación" color={colors.ink} />
      )}
      {eligibility.status === "error" && (
        <>
          <Text tone="redPen">No pudimos consultar la comprobación.</Text>
          <Button label="Reintentar" variant="secondary" onPress={retryEligibility} />
        </>
      )}
      {eligibility.status === "missing" && (
        <>
          <Text tone="muted">
            Se habilita 24 horas después de completar la lección «¿Cómo te llamas?».
          </Text>
          <Button
            label="Abrir la lección «¿Cómo te llamas?»"
            variant="secondary"
            onPress={openSource}
          />
        </>
      )}
      {eligibility.status === "waiting" && (
        <Text tone="muted">
          La comprobación estará disponible cuando hayan pasado 24 horas desde la lección.
        </Text>
      )}
      {eligibility.status === "ready" && (
        <>
          <Text tone="muted">
            Ya puedes responder tres preguntas para practicar cómo presentarte y conocer a alguien.
          </Text>
          <Button label="Hacer comprobación" onPress={openCheckpoint} />
        </>
      )}
      {eligibility.status === "completed" && eligibility.evidence.result !== null && (
        <Text>{`${eligibility.evidence.result.correct} de 3 respuestas correctas · ${formatCheckpointDate(eligibility.evidence.result.localDate)}`}</Text>
      )}
    </View>
  );
}

function formatCheckpointDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(
    new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 12)),
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    card: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: 18,
      backgroundColor: colors.sheet,
      borderWidth: 1,
      borderColor: colors.rule,
    },
  }),
);
