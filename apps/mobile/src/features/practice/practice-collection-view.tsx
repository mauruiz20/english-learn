import { ActivityIndicator, StyleSheet, View } from "react-native";
import { PerfectBadge } from "@/features/lesson/components/perfect-badge";
import { scoreDescription, scoreText } from "@/features/lesson/model/lesson-score";
import {
  dialogueScoreDescription,
  dialogueScoreText,
} from "@/features/dialogues/model/dialogue-catalog";
import { levelHighlighter, topicHighlighter } from "@/features/topics/topic-colors";
import { HandCheck } from "@/shared/ui/hand-check";
import { Highlight } from "@/shared/ui/highlight";
import { PressableScale } from "@/shared/ui/pressable-scale";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Sticker } from "@/shared/ui/sticker";
import { Text } from "@/shared/ui/text";
import { radius, spacing } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { Chevron } from "./chevron";
import type { PracticeGroupRow, PracticeLessonRow } from "./model/practice-catalog";

export type PracticeCollectionViewState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "not-found" }
  | {
      readonly status: "ready";
      readonly title: string;
      readonly summary: string;
      /** Tints the group titles (the collection's slug). */
      readonly topic?: string;
      readonly groups: readonly PracticeGroupRow[];
    };

/**
 * `/practica/[collection]`: the groups of one topic, each with its level as a label, the verbs
 * it teaches and its 2–3 lessons with their best result. Every lesson is open.
 */
export function PracticeCollectionView({
  state,
  onOpenLesson,
}: {
  state: PracticeCollectionViewState;
  onOpenLesson: (lessonId: string) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <ScreenContainer title={state.status === "ready" ? state.title : "Práctica libre"}>
      {state.status === "loading" && (
        <ActivityIndicator accessibilityLabel="Cargando los grupos" color={colors.ink} />
      )}
      {state.status === "error" && (
        <Text accessibilityRole="alert" tone="redPen">
          No pudimos cargar tu progreso.
        </Text>
      )}
      {state.status === "not-found" && <Text>No encontramos este tema de práctica.</Text>}
      {state.status === "ready" && (
        <>
          <Text tone="muted">{state.summary}</Text>
          {state.groups.map((group) => (
            <View key={group.id} style={styles.group}>
              <View
                accessible
                accessibilityRole="header"
                accessibilityLabel={`${group.title}, nivel ${group.level}`}
                style={styles.groupHeader}
              >
                <Highlight variant="title" color={topicHighlighter(state.topic ?? group.id)}>
                  {group.title}
                </Highlight>
                <View
                  style={[
                    styles.levelChip,
                    { backgroundColor: colors.highlighters[levelHighlighter(group.level)] },
                  ]}
                >
                  <Text variant="smallStrong" style={{ color: colors.onHighlighter }}>
                    {group.level}
                  </Text>
                </View>
              </View>
              <Text>{group.summary}</Text>
              {group.verbs.length > 0 && (
                <Text variant="small" tone="muted">
                  {group.verbs.join(" · ")}
                </Text>
              )}
              <View>
                {group.lessons.map((lesson) => (
                  <LessonRow
                    key={lesson.id}
                    lesson={lesson}
                    color={topicHighlighter(state.topic ?? group.id)}
                    onPress={() => onOpenLesson(lesson.id)}
                  />
                ))}
              </View>
            </View>
          ))}
        </>
      )}
    </ScreenContainer>
  );
}

function LessonRow({
  lesson,
  color,
  onPress,
}: {
  lesson: PracticeLessonRow;
  color: ReturnType<typeof topicHighlighter>;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { score } = lesson;
  const done = score !== undefined;
  // A dialogue is masculine: "nuevo", "Perfecto · 6/6", "Repítelo".
  const dialogue = lesson.kind === "dialogue";
  const hint =
    done && !score.perfect
      ? dialogue
        ? "Repítelo para sacar todo bien"
        : "Repítela para sacar todo bien"
      : dialogue
        ? "Abre el diálogo"
        : "Abre la lección";
  const description = !done
    ? dialogue
      ? "nuevo"
      : "nueva"
    : dialogue
      ? dialogueScoreDescription(score)
      : scoreDescription(score);
  const marker = !done
    ? dialogue
      ? "Nuevo"
      : "Nueva"
    : dialogue
      ? dialogueScoreText(score)
      : scoreText(score);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${lesson.fullTitle}, ${description}`}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View>
        <Sticker color={color} state={done ? "done" : "pending"} size={40} tilt={done ? -6 : 0}>
          {done ? (
            <HandCheck color={colors.onHighlighter} />
          ) : (
            <Text variant="bodyStrong" tone="muted">
              {String(lesson.number)}
            </Text>
          )}
        </Sticker>
        {score?.perfect === true && (
          <PerfectBadge
            testID={`practice-perfect-${lesson.id}`}
            size={20}
            style={styles.perfectBadge}
          />
        )}
      </View>
      <View style={styles.rowText}>
        <Text variant="bodyStrong">{lesson.title}</Text>
        <Text variant="smallStrong" tone={done ? "success" : "muted"}>
          {marker}
        </Text>
      </View>
      <Chevron />
    </PressableScale>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    group: {
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.sheet,
      boxShadow: `0 3px 0 ${colors.rule}`,
    },
    groupHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
    levelChip: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 1 },
    row: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.sm,
      paddingRight: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.rule,
      borderRadius: radius.sm,
    },
    pressed: { backgroundColor: colors.rule },
    rowText: { flex: 1, gap: 2 },
    perfectBadge: { position: "absolute", right: -8, top: -8 },
  }),
);
