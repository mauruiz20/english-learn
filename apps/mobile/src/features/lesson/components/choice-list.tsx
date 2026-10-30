import { StyleSheet, View } from "react-native";
import { ChoiceRow } from "@/shared/ui/choice-row";
import { spacing } from "@/shared/ui/theme";

type ChoiceListProps = {
  /** Accessible name of the group (e.g. the question). */
  label: string;
  options: readonly string[];
  selected: string | null;
  disabled: boolean;
  onSelect: (option: string) => void;
};

/** Single-choice list of large radio rows. */
export function ChoiceList({ label, options, selected, disabled, onSelect }: ChoiceListProps) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.list}>
      {options.map((option) => (
        <ChoiceRow
          key={option}
          label={option}
          checked={option === selected}
          disabled={disabled}
          onPress={() => onSelect(option)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
});
