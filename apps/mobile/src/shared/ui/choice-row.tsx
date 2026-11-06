import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Highlight } from "./highlight";
import { PressableScale } from "./pressable-scale";
import { struckText } from "./struck";
import { Text } from "./text";
import { radius, spacing } from "./theme";
import { themedStyles, useTheme } from "./use-theme";

/**
 * The teacher's marking of an option once the answer is checked: the right answer is
 * highlighted, the learner's wrong pick is struck in red pen, the rest step back.
 */
export type ChoiceMark = "correct" | "wrong" | "dimmed";

type ChoiceRowProps = {
  label: string;
  /** What the row shows instead of the plain `label` (same text, e.g. with lookup targets). */
  content?: ReactNode;
  checked: boolean;
  disabled: boolean;
  onPress: () => void;
  mark?: ChoiceMark | undefined;
  /** Plays the soft press click (default); off when the list plays its own tap. */
  pressSound?: boolean;
};

/** What a screen reader hears: the option, plus how it was marked. */
function spokenLabel(label: string, checked: boolean, mark: ChoiceMark | undefined): string {
  if (mark === "correct") {
    return checked ? `${label}, seleccionada, respuesta correcta` : `${label}, respuesta correcta`;
  }
  if (mark === "wrong") return `${label}, seleccionada, incorrecta`;
  return label;
}

/**
 * One option of a single-choice group (a radio): ink outline, filled with ink when chosen. Once
 * marked it is a corrected answer instead (see `ChoiceMark`).
 */
export function ChoiceRow({
  label,
  content,
  checked,
  disabled,
  onPress,
  mark,
  pressSound = true,
}: ChoiceRowProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const filled = checked && mark === undefined;
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityLabel={spokenLabel(label, checked, mark)}
      accessibilityState={{ checked, disabled }}
      // react-native-web drops `checked` for a radio: the web reads it from here.
      aria-checked={checked}
      disabled={disabled}
      pressSound={pressSound}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        filled && styles.checked,
        pressed && !checked && styles.pressed,
        mark === undefined && disabled && !checked && styles.locked,
        mark === "wrong" && styles.wrong,
        mark === "correct" && styles.correct,
        mark === "dimmed" && styles.dimmed,
      ]}
    >
      {mark === "correct" ? (
        <>
          <View style={styles.label}>
            <Highlight animate variant="bodyStrong" content={content}>
              {label}
            </Highlight>
          </View>
          <View style={styles.tick}>
            <View style={[styles.check, { borderColor: colors.ink }]} />
            <Text variant="smallStrong" tone="ink">
              correcta
            </Text>
          </View>
        </>
      ) : (
        <Text
          variant={checked ? "bodyStrong" : "body"}
          tone={filled ? "onInk" : mark === "wrong" ? "muted" : "text"}
          style={[styles.label, mark === "wrong" && struckText(colors)]}
        >
          {content ?? label}
        </Text>
      )}
    </PressableScale>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    row: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.rule,
      backgroundColor: colors.sheet,
      boxShadow: `0 3px 0 ${colors.rule}`,
    },
    label: { flexShrink: 1, flexGrow: 1 },
    checked: {
      backgroundColor: colors.ink,
      borderColor: colors.ink,
      boxShadow: `0 3px 0 ${colors.inkEdge}`,
    },
    pressed: { backgroundColor: colors.rule, transform: [{ translateY: 2 }], boxShadow: "none" },
    locked: { opacity: 0.55 },
    // The learner's pick, circled in red pen: an outline, never a fill.
    wrong: { borderColor: colors.redPen, borderWidth: 2, boxShadow: "none" },
    correct: {
      borderColor: colors.feedback.correct.ink,
      boxShadow: `0 3px 0 ${colors.feedback.correct.ink}`,
    },
    dimmed: { borderColor: colors.rule, opacity: 0.6, boxShadow: "none" },
    tick: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 2 },
    // A ballpoint check mark: the short and long strokes of an L turned 45°.
    check: {
      width: 7,
      height: 13,
      marginTop: -3,
      borderRightWidth: 2.5,
      borderBottomWidth: 2.5,
      transform: [{ rotate: "45deg" }],
    },
  }),
);
