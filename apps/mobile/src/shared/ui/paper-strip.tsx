import { Pressable, StyleSheet } from "react-native";
import { Text } from "./text";
import { TOUCH_TARGET, spacing } from "./theme";
import { themedStyles } from "./use-theme";

type PaperStripProps = {
  /** Accessible name (e.g. "Quitar wake" for a placed word). */
  label: string;
  text: string;
  disabled: boolean;
  onPress: () => void;
};

/** A word cut out of paper: moves between the word bank and the answer line when tapped. */
export function PaperStrip({ label, text, disabled, onPress }: PaperStripProps) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
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
