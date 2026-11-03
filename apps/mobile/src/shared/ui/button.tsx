import { StyleSheet } from "react-native";
import { PressableScale } from "./pressable-scale";
import { Text } from "./text";
import { TOUCH_TARGET, fonts, radius, spacing, typeScale } from "./theme";
import { themedStyles } from "./use-theme";

type ButtonProps = {
  label: string;
  onPress: () => void;
  /**
   * primary: an ink key with a darker lip that goes down when pressed; secondary: a paper key
   * with an ink outline; text: a quiet link-like action.
   */
  variant?: "primary" | "secondary" | "text";
  accessibilityHint?: string;
  disabled?: boolean;
  /** Plays the soft press click (default); off where the press plays its own sound. */
  pressSound?: boolean;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  accessibilityHint,
  disabled = false,
  pressSound = true,
}: ButtonProps) {
  const styles = useStyles();
  return (
    <PressableScale
      wrapperStyle={variant === "text" && styles.textWrapper}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      disabled={disabled}
      pressSound={pressSound}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        pressed && variant !== "text" && styles.pushed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
    </PressableScale>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    base: {
      minHeight: TOUCH_TARGET,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.lg,
      alignItems: "center",
      justifyContent: "center",
    },
    primary: { backgroundColor: colors.ink, boxShadow: `0 4px 0 ${colors.inkEdge}` },
    secondary: {
      borderWidth: 2,
      borderColor: colors.ink,
      backgroundColor: colors.sheet,
      boxShadow: `0 4px 0 ${colors.ink}`,
    },
    text: { alignSelf: "flex-start", paddingHorizontal: 0 },
    // The press itself shows as a slight shrink (PressableScale); the ink only dims a little.
    pressed: { opacity: 0.9 },
    // A key going down: the lip shrinks as the key moves onto it (no layout shift).
    pushed: { transform: [{ translateY: 3 }], boxShadow: "none" },
    textWrapper: { alignSelf: "flex-start" },
    disabled: { opacity: 0.4 },
    label: { fontFamily: fonts.bodyBold, ...typeScale.body },
    primaryLabel: { color: colors.onInk },
    secondaryLabel: { color: colors.ink },
    textLabel: { color: colors.ink, textDecorationLine: "underline" },
  }),
);
