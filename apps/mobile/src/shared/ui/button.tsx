import { StyleSheet } from "react-native";
import { PressableScale } from "./pressable-scale";
import { Text } from "./text";
import { TOUCH_TARGET, fonts, radius, spacing, typeScale } from "./theme";
import { themedStyles } from "./use-theme";

type ButtonProps = {
  label: string;
  onPress: () => void;
  /** primary: ink fill; secondary: ink outline; text: a quiet link-like action. */
  variant?: "primary" | "secondary" | "text";
  accessibilityHint?: string;
  disabled?: boolean;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  accessibilityHint,
  disabled = false,
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
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
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
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    primary: { backgroundColor: colors.ink },
    secondary: { borderWidth: 1.5, borderColor: colors.ink },
    text: { alignSelf: "flex-start", paddingHorizontal: 0 },
    // The press itself shows as a slight shrink (PressableScale); the ink only dims a little.
    pressed: { opacity: 0.85 },
    textWrapper: { alignSelf: "flex-start" },
    disabled: { opacity: 0.4 },
    label: { fontFamily: fonts.bodyBold, ...typeScale.body },
    primaryLabel: { color: colors.onInk },
    secondaryLabel: { color: colors.ink },
    textLabel: { color: colors.ink, textDecorationLine: "underline" },
  }),
);
