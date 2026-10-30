import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/shared/ui/theme";

type ChoiceListProps = {
  /** Accessible name of the group (e.g. the question). */
  label: string;
  options: readonly string[];
  selected: string | null;
  disabled: boolean;
  onSelect: (option: string) => void;
};

/** Single-choice list of large radio buttons. */
export function ChoiceList({ label, options, selected, disabled, onSelect }: ChoiceListProps) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.list}>
      {options.map((option) => {
        const checked = option === selected;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityLabel={option}
            accessibilityState={{ checked, disabled }}
            disabled={disabled}
            onPress={() => onSelect(option)}
            style={({ pressed }) => [
              styles.option,
              checked && styles.checked,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.label, checked && styles.checkedLabel]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  option: {
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  checked: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.8 },
  label: { fontSize: 17, color: colors.text },
  checkedLabel: { fontWeight: "600" },
});
