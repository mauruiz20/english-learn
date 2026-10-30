import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Button } from "@/shared/ui/button";
import { formatDays } from "@/shared/ui/format";
import { MarginNote } from "@/shared/ui/margin-note";
import { ProgressLine } from "@/shared/ui/progress-line";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import type { ReviewNote } from "../model/items-to-review";

/**
 * A thin ink line with "Ejercicio 2 de 6" (and the lesson title) under it: where the learner is
 * in a lesson or review.
 */
export function SessionProgress({
  position,
  total,
  title,
}: {
  position: number;
  total: number;
  title?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.progress}>
      <ProgressLine value={position - 1} max={total} label="Progreso" />
      <View style={styles.progressRow}>
        {title !== undefined && (
          <Text variant="smallStrong" tone="ink" style={styles.progressTitle}>
            {title}
          </Text>
        )}
        <Text variant="small" tone="muted">{`Ejercicio ${position} de ${total}`}</Text>
      </View>
    </View>
  );
}

type SummaryProps = {
  title: string;
  correct: number;
  total: number;
  xpEarned: number;
  streakDays: number;
  /** Items missed in the session (wrong or almost), at most a handful. */
  toReview: readonly ReviewNote[];
  onGoHome: () => void;
};

/** The graded page: the teacher's score in red pen in the corner, then the results on lines. */
export function SessionSummary({
  title,
  correct,
  total,
  xpEarned,
  streakDays,
  toReview,
  onGoHome,
}: SummaryProps) {
  const styles = useStyles();
  return (
    <ScreenContainer
      title={title}
      aside={
        <MarginNote
          variant="grade"
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.grade}
        >
          {`${correct}/${total}`}
        </MarginNote>
      }
    >
      <View>
        {[
          `Aciertos: ${correct} de ${total}`,
          `XP ganada: ${xpEarned}`,
          `Racha: ${formatDays(streakDays)}`,
        ].map((line) => (
          <Text key={line} variant="title" style={styles.line}>
            {line}
          </Text>
        ))}
      </View>
      <View style={styles.review}>
        <Text accessibilityRole="header" variant="title" tone="ink">
          Para repasar
        </Text>
        {toReview.length === 0 ? (
          <Text tone="muted" style={styles.allRight}>
            Nada que corregir: todo correcto a la primera. Estas palabras volverán en tus próximos
            repasos.
          </Text>
        ) : (
          <View>
            {toReview.map((note) => (
              <View key={note.id} style={[styles.line, styles.note]}>
                <Text variant="bodyStrong">{note.term}</Text>
                <Text tone="muted">{note.es}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <Button label="Volver al inicio" onPress={onGoHome} />
    </ScreenContainer>
  );
}

/** Waiting for the session to be saved. */
export function SavingScreen({ title, label }: { title: string; label: string }) {
  const { colors } = useTheme();
  return (
    <ScreenContainer title={title}>
      <ActivityIndicator accessibilityLabel={label} color={colors.ink} />
    </ScreenContainer>
  );
}

/** A problem message with "Reintentar" (when retrying makes sense) and a way home. */
export function SessionMessage({
  title,
  text,
  onRetry,
  onGoHome,
}: {
  title: string;
  text: string;
  onRetry?: () => void;
  onGoHome?: () => void;
}) {
  return (
    <ScreenContainer title={title}>
      <Text accessibilityRole="alert" tone="redPen">
        {text}
      </Text>
      {onRetry !== undefined && <Button label="Reintentar" onPress={onRetry} />}
      {onGoHome !== undefined && (
        <Button
          label="Volver al inicio"
          variant={onRetry === undefined ? "primary" : "secondary"}
          onPress={onGoHome}
        />
      )}
    </ScreenContainer>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    progress: { gap: spacing.sm },
    progressRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
    progressTitle: { flexShrink: 1 },
    grade: { marginRight: spacing.xs, transform: [{ translateY: -6 }] },
    line: {
      paddingVertical: spacing.sm + 2,
      borderBottomWidth: 1,
      borderBottomColor: colors.rule,
    },
    review: { gap: spacing.xs },
    allRight: { paddingTop: spacing.xs },
    // "have breakfast   desayunar": the word and its meaning on one ruled line (wraps if long).
    note: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "baseline",
      columnGap: spacing.md,
    },
  }),
);
