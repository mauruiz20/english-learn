import { Pressable, StyleSheet } from "react-native";
import { Text } from "./text";
import { radius, spacing } from "./theme";
import { themedStyles } from "./use-theme";

type ChoiceRowProps = {
  label: string;
  checked: boolean;
  disabled: boolean;
  onPress: () => void;
};

/** One option of a single-choice group (a radio): ink outline, filled with ink when chosen. */
export function ChoiceRow({ label, checked, disabled, onPress }: ChoiceRowProps) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        checked && styles.checked,
        pressed && !checked && styles.pressed,
        disabled && !checked && styles.locked,
      ]}
    >
      <Text variant={checked ? "bodyStrong" : "body"} tone={checked ? "onInk" : "text"}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    row: {
      minHeight: 52,
      justifyContent: "center",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.ink,
    },
    checked: { backgroundColor: colors.ink },
    pressed: { backgroundColor: colors.rule },
    locked: { opacity: 0.55 },
  }),
);
