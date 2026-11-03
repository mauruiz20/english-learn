import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
} from "react-native";
import { usePressSound } from "./press-sound";
import { Text } from "./text";
import { TOUCH_TARGET, spacing } from "./theme";
import { themedStyles } from "./use-theme";

type PaperStripProps = {
  /** Accessible name (e.g. "Quitar wake" for a placed word). */
  label: string;
  text: string;
  disabled: boolean;
  onPress: () => void;
  /**
   * Content shown instead of `text` while `disabled` (e.g. words to look up once the answer is
   * checked). The strip is then plain paper, not a button, so its content can be interactive.
   */
  lockedContent?: ReactNode;
  /** Extra screen-reader actions (e.g. moving a placed word left or right). */
  accessibilityActions?: readonly AccessibilityActionInfo[] | undefined;
  onAccessibilityAction?: ((event: AccessibilityActionEvent) => void) | undefined;
  /** Plays the soft press click (default); off when the exercise plays its own tap. */
  pressSound?: boolean;
};

/**
 * A word cut out of paper: moves between the word bank and the answer line when tapped (the
 * accessible path), or when dragged (see `DraggableStrip`).
 */
export function PaperStrip({
  label,
  text,
  disabled,
  onPress,
  lockedContent,
  accessibilityActions,
  onAccessibilityAction,
  pressSound = true,
}: PaperStripProps) {
  const styles = useStyles();
  const click = usePressSound();
  if (disabled && lockedContent !== undefined) {
    return (
      <View style={styles.strip}>
        <Text variant="body" style={styles.text}>
          {lockedContent}
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      {...(accessibilityActions === undefined
        ? {}
        : { accessibilityActions, onAccessibilityAction })}
      disabled={disabled}
      onPress={() => {
        if (pressSound) click();
        onPress();
      }}
      style={({ pressed }) => [styles.strip, pressed && styles.pressed]}
    >
      <Text variant="body" style={styles.text}>
        {text}
      </Text>
    </Pressable>
  );
}

const useStyles = themedStyles(({ colors, scheme }) =>
  StyleSheet.create({
    strip: {
      minHeight: TOUCH_TARGET - 4,
      minWidth: TOUCH_TARGET,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      backgroundColor: colors.sheet,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: colors.rule,
      borderRadius: 2,
      boxShadow: `2px 2px 0 ${scheme === "dark" ? "#08101F" : colors.rule}`,
    },
    pressed: { transform: [{ translateX: 1 }, { translateY: 1 }], boxShadow: "none" },
    text: { fontSize: 19 },
  }),
);
