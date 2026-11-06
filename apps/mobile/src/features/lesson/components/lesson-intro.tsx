import type { LessonIntro } from "@english-learn/content";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { WithSpeaker } from "@/features/pronunciation/with-speaker";
import { topicHighlighter } from "@/features/topics/topic-colors";
import { Button } from "@/shared/ui/button";
import { Highlight } from "@/shared/ui/highlight";
import { PressableScale } from "@/shared/ui/pressable-scale";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { struckText } from "@/shared/ui/struck";
import { Text } from "@/shared/ui/text";
import { radius, spacing } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";

/**
 * The theory itself: the points as short bullets, the examples (English with its speaker, then
 * the Spanish) and the typical mistake struck through in red pen, its correction and the note.
 * Plain text: no word lookups here, they would cap the grade of the lesson's items.
 */
export function IntroContent({ intro }: { intro: LessonIntro }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.content}>
      <View style={styles.points}>
        {intro.points.map((point) => (
          <View key={point} style={styles.point}>
            <Text tone="ink" importantForAccessibility="no" aria-hidden>
              •
            </Text>
            <Text style={styles.pointText}>{point}</Text>
          </View>
        ))}
      </View>
      <View style={styles.examples}>
        {intro.examples.map((example) => (
          <WithSpeaker key={example.en} text={example.en}>
            <View style={styles.example}>
              <Text variant="bodyStrong">{example.en}</Text>
              <Text variant="small" tone="muted">
                {example.es}
              </Text>
            </View>
          </WithSpeaker>
        ))}
      </View>
      {intro.mistake !== undefined && (
        <View style={styles.mistake}>
          <Text
            accessibilityLabel={`Incorrecto: ${intro.mistake.wrong}`}
            style={styles.mistakeLine}
          >
            <Text tone="redPen" variant="bodyStrong">
              {"✗ "}
            </Text>
            <Text style={struckText(colors)}>{intro.mistake.wrong}</Text>
          </Text>
          <Text accessibilityLabel={`Correcto: ${intro.mistake.right}`} style={styles.mistakeLine}>
            <Text tone="success" variant="bodyStrong">
              {"✓ "}
            </Text>
            <Text variant="bodyStrong">{intro.mistake.right}</Text>
          </Text>
          <Text variant="small" tone="muted">
            {intro.mistake.note}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * "Antes de empezar": the lesson's short theory before its first exercise, one phone screen
 * tall, with its action ("Empezar", or "Volver al resumen" when reopened from the summary)
 * pinned at the bottom so it never scrolls away. Nothing animates.
 */
export function LessonIntroScreen({
  title,
  topic,
  intro,
  actionLabel,
  onAction,
}: {
  /** The lesson's title. */
  title: string;
  /** Topic slug: its highlighter marks the title. */
  topic: string | undefined;
  intro: LessonIntro;
  actionLabel: string;
  onAction: () => void;
}) {
  const styles = useStyles();
  return (
    <ScreenContainer
      title="Antes de empezar"
      footer={
        <View style={styles.footer}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      }
    >
      <View testID="lesson-intro" style={styles.screen}>
        <View style={styles.lessonTitle}>
          {topic === undefined ? (
            <Text variant="title">{title}</Text>
          ) : (
            <Highlight variant="title" color={topicHighlighter(topic)}>
              {title}
            </Highlight>
          )}
        </View>
        <IntroContent intro={intro} />
      </View>
    </ScreenContainer>
  );
}

/**
 * The collapsed theory above the first exercise of a redo or a completed lesson: a small
 * "Repasar la teoría" toggle that opens it in place (never a blocking screen).
 */
export function IntroToggle({ intro }: { intro: LessonIntro }) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  return (
    <View testID="lesson-intro-toggle" style={styles.toggleBox}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Repasar la teoría"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((was) => !was)}
        wrapperStyle={styles.toggleWrapper}
        style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
      >
        <Text variant="smallStrong" tone="ink">
          Repasar la teoría
        </Text>
        <Text variant="smallStrong" tone="ink" importantForAccessibility="no" aria-hidden>
          {open ? "▴" : "▾"}
        </Text>
      </PressableScale>
      {open && (
        <View style={styles.toggleContent}>
          <IntroContent intro={intro} />
        </View>
      )}
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    screen: { gap: spacing.md },
    lessonTitle: { alignSelf: "flex-start" },
    content: { gap: spacing.md },
    points: { gap: spacing.xs },
    point: { flexDirection: "row", gap: spacing.sm },
    pointText: { flex: 1 },
    examples: {
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.sheet,
      borderWidth: 1,
      borderColor: colors.rule,
    },
    example: { gap: 2 },
    mistake: {
      gap: 2,
      paddingLeft: spacing.sm,
      borderLeftWidth: 3,
      borderLeftColor: colors.redPen,
    },
    mistakeLine: { flexShrink: 1 },
    footer: { gap: spacing.sm },
    toggleBox: { gap: spacing.sm },
    toggleWrapper: { alignSelf: "flex-start" },
    toggle: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: colors.ink,
      backgroundColor: colors.sheet,
    },
    togglePressed: { backgroundColor: colors.rule },
    toggleContent: {
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.sheet,
      borderWidth: 1,
      borderColor: colors.rule,
    },
  }),
);
