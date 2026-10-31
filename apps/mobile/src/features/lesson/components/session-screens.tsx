import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GlossaryText } from "@/features/glossary/glossary-text";
import { lookupEnabled } from "@/features/lesson/model/lookup-policy";
import { topicHighlighter } from "@/features/topics/topic-colors";
import { topicLabel } from "@/features/topics/topic-labels";
import { Button } from "@/shared/ui/button";
import { formatDays } from "@/shared/ui/format";
import { Highlight } from "@/shared/ui/highlight";
import { MarginNote } from "@/shared/ui/margin-note";
import { PerfectStamp } from "@/shared/ui/perfect-stamp";
import { RollingNumber } from "@/shared/ui/rolling-number";
import { ProgressLine } from "@/shared/ui/progress-line";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import { useCountUp } from "@/shared/ui/use-count-up";
import { useReducedMotion } from "@/shared/ui/use-reduced-motion";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { STREAK_SOUND_DELAY_MS } from "../use-session-sounds";
import type { ReviewNote } from "../model/items-to-review";

/**
 * A thin ink line with "Ejercicio 2 de 6" (and the lesson title) under it: where the learner is
 * in a lesson or review. With a `topic`, the line and the label are marked with its highlighter;
 * the label is the title, or the topic's name when there is no title (review).
 */
export function SessionProgress({
  position,
  total,
  title,
  topic,
}: {
  position: number;
  total: number;
  title?: string;
  topic?: string | undefined;
}) {
  const styles = useStyles();
  const tint = topic === undefined ? undefined : topicHighlighter(topic);
  const label = title ?? (topic === undefined ? undefined : topicLabel(topic));
  return (
    <View style={styles.progress}>
      <ProgressLine value={position - 1} max={total} label="Progreso" tint={tint} />
      <View style={styles.progressRow}>
        {label !== undefined &&
          (tint === undefined ? (
            <Text variant="smallStrong" tone="ink" style={styles.progressTitle}>
              {label}
            </Text>
          ) : (
            <View style={styles.progressTitle}>
              <Highlight variant="smallStrong" color={tint}>
                {label}
              </Highlight>
            </View>
          ))}
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
  /** This session extended the streak (the number rolls to its new value, with the sound). */
  streakIncreased?: boolean;
  /** Items missed in the session (wrong or almost), at most a handful. */
  toReview: readonly ReviewNote[];
  onGoHome: () => void;
};

/**
 * The graded page: the teacher's score in red pen in the corner, then the results on lines. Its
 * one moment of motion rewards the session: a perfect page gets the "¡Excelente!" stamp, the XP
 * counts up and a grown streak rolls to its new number as the streak sound plays.
 */
export function SessionSummary({
  title,
  correct,
  total,
  xpEarned,
  streakDays,
  streakIncreased = false,
  toReview,
  onGoHome,
}: SummaryProps) {
  const styles = useStyles();
  const perfect = total > 0 && correct === total;
  const xp = useCountUp(xpEarned);
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
        <Text variant="title" style={styles.line}>{`Aciertos: ${correct} de ${total}`}</Text>
        <Text variant="title" accessibilityLabel={`XP ganada: ${xpEarned}`} style={styles.line}>
          {`XP ganada: ${xp}`}
        </Text>
        <StreakLine days={streakDays} increased={streakIncreased} />
        {perfect && (
          <View style={styles.stamp}>
            <PerfectStamp />
          </View>
        )}
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
                {note.topic !== undefined && <TopicTab topic={note.topic} />}
                <GlossaryText
                  variant="bodyStrong"
                  text={note.term}
                  enabled={lookupEnabled("summary.terms", true)}
                />
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

/** "Racha: 3 días"; when the session grew it, the number rolls up from the old value. */
function StreakLine({ days, increased }: { days: number; increased: boolean }) {
  const styles = useStyles();
  const reduced = useReducedMotion();
  const label = `Racha: ${formatDays(days)}`;
  if (!increased || reduced || days < 1) {
    return (
      <Text variant="title" style={styles.line}>
        {label}
      </Text>
    );
  }
  return (
    <View accessible accessibilityLabel={label} style={[styles.line, styles.streak]}>
      <Text variant="title">{"Racha:\u00A0"}</Text>
      <RollingNumber from={days - 1} to={days} delayMs={STREAK_SOUND_DELAY_MS} />
      <Text variant="title">{`\u00A0${days === 1 ? "día" : "días"}`}</Text>
    </View>
  );
}

/** A small tab in the topic's highlighter, like a colored index sticker (decorative). */
function TopicTab({ topic }: { topic: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.tab, { backgroundColor: colors.highlighters[topicHighlighter(topic)] }]}
    />
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
    tab: { width: 6, height: 16, borderRadius: 2, alignSelf: "center" },
    grade: { marginRight: spacing.xs, transform: [{ translateY: -6 }] },
    line: {
      paddingVertical: spacing.sm + 2,
      borderBottomWidth: 1,
      borderBottomColor: colors.rule,
    },
    review: { gap: spacing.xs },
    streak: { flexDirection: "row", alignItems: "center" },
    // Pressed onto the results, at the right of the column.
    stamp: { position: "absolute", right: spacing.xs, top: spacing.lg },
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
