import { ActivityIndicator, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { levelHighlighter, topicHighlighter } from "@/features/topics/topic-colors";
import { HandCheck } from "@/shared/ui/hand-check";
import { Highlight } from "@/shared/ui/highlight";
import { PressableScale } from "@/shared/ui/pressable-scale";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Sticker } from "@/shared/ui/sticker";
import { Text } from "@/shared/ui/text";
import { radius, spacing } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { PerfectBadge } from "@/features/lesson/components/perfect-badge";
import { scoreDescription, scoreText } from "@/features/lesson/model/lesson-score";
import type { CardGroup, CardRow } from "./model/card-catalog";

export type CardsViewState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | {
      readonly status: "ready";
      readonly groups: readonly CardGroup[];
      readonly total: number;
      readonly studied: number;
    };

/** "28 fichas · 3 estudiadas". */
export function cardsCount(total: number, studied: number): string {
  return `${total} ${total === 1 ? "ficha" : "fichas"} · ${studied} ${
    studied === 1 ? "estudiada" : "estudiadas"
  }`;
}

/**
 * The study cards, like the notebook's index of explanations: grouped by kind (each with its
 * colored tab), then by level. A studied card has its sticker with a check; a new one is an empty
 * slot. Nothing is locked.
 */
export function CardsView({
  state,
  onOpenCard,
}: {
  state: CardsViewState;
  onOpenCard: (cardId: string) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <ScreenContainer title="Fichas">
      {state.status === "loading" && (
        <ActivityIndicator accessibilityLabel="Cargando las fichas" color={colors.ink} />
      )}
      {state.status === "error" && (
        <Text accessibilityRole="alert" tone="redPen">
          No pudimos cargar tu progreso.
        </Text>
      )}
      {state.status === "ready" && (
        <>
          <View style={styles.intro}>
            <Text variant="bodyStrong">{cardsCount(state.total, state.studied)}</Text>
            <Text tone="muted">
              Explicaciones cortas con ejemplos. Practica una ficha y sus palabras vuelven en tus
              repasos.
            </Text>
          </View>
          {state.groups.map((group) => (
            <View key={group.kind} style={styles.group}>
              <View style={styles.tab}>
                <Highlight
                  accessibilityRole="header"
                  variant="title"
                  color={topicHighlighter(group.topic)}
                >
                  {group.label}
                </Highlight>
              </View>
              {group.levels.map(({ level, cards }) => (
                <View key={level} style={styles.level}>
                  <Text variant="smallStrong" tone="muted" style={styles.levelName}>
                    {`Nivel ${level}`}
                  </Text>
                  {cards.map((card) => (
                    <CardRowButton
                      key={card.id}
                      card={card}
                      color={topicHighlighter(group.topic)}
                      onPress={() => onOpenCard(card.id)}
                    />
                  ))}
                </View>
              ))}
            </View>
          ))}
        </>
      )}
    </ScreenContainer>
  );
}

const STATUS_WORD = { new: "", studied: "estudiada", mastered: "dominada" } as const;

function CardRowButton({
  card,
  color,
  onPress,
}: {
  card: CardRow;
  color: ReturnType<typeof topicHighlighter>;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const studied = card.status !== "new";
  const label = [
    card.title,
    card.level,
    STATUS_WORD[card.status],
    card.score === undefined ? "" : scoreDescription(card.score),
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View>
        <Sticker
          color={color}
          state={studied ? "done" : "pending"}
          size={36}
          tilt={studied ? -6 : 0}
        >
          {studied && <HandCheck testID={`card-check-${card.id}`} color={colors.onHighlighter} />}
        </Sticker>
        {card.score?.perfect === true && (
          <PerfectBadge testID={`card-perfect-${card.id}`} size={20} style={styles.perfectBadge} />
        )}
      </View>
      <View style={styles.rowText}>
        <Text variant="bodyStrong">{card.title}</Text>
        <View style={styles.rowMeta}>
          <View
            style={[
              styles.levelChip,
              { backgroundColor: colors.highlighters[levelHighlighter(card.level)] },
            ]}
          >
            <Text variant="smallStrong" style={{ color: colors.onHighlighter }}>
              {card.level}
            </Text>
          </View>
          {card.status === "studied" && (
            <Text variant="smallStrong" tone="success">
              Estudiada
            </Text>
          )}
          {card.status === "mastered" && (
            <Text variant="smallStrong" tone="success">
              Dominada
            </Text>
          )}
          {card.score !== undefined && (
            <Text variant="smallStrong" tone="success">
              {scoreText(card.score)}
            </Text>
          )}
        </View>
      </View>
      <Svg width={20} height={20} viewBox="0 0 24 24" aria-hidden>
        <Path
          d="M9 5l7 7-7 7"
          fill="none"
          stroke={colors.ink}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </PressableScale>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    intro: { gap: spacing.xs },
    group: { gap: spacing.sm },
    tab: { alignSelf: "flex-start" },
    level: { gap: 0 },
    levelName: { marginTop: spacing.xs },
    row: {
      minHeight: 60,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.sm,
      paddingRight: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
      borderRadius: radius.sm,
    },
    pressed: { backgroundColor: colors.rule },
    rowText: { flex: 1, gap: 2 },
    rowMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
    // The star sticks on the card's sticker corner, like a lesson's on the path.
    perfectBadge: { position: "absolute", right: -8, top: -8 },
    levelChip: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  }),
);
