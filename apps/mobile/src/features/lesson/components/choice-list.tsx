import { StyleSheet, View } from "react-native";
import { ChoiceRow, type ChoiceMark } from "@/shared/ui/choice-row";
import { spacing } from "@/shared/ui/theme";

type ChoiceListProps = {
  /** Accessible name of the group (e.g. the question). */
  label: string;
  options: readonly string[];
  selected: string | null;
  disabled: boolean;
  onSelect: (option: string) => void;
  /** Once the answer is checked: the options that were right. Marks every option. */
  correctOptions?: readonly string[] | undefined;
};

function markOf(
  option: string,
  selected: string | null,
  correctOptions: readonly string[] | undefined,
): ChoiceMark | undefined {
  if (correctOptions === undefined) return undefined;
  if (correctOptions.includes(option)) return "correct";
  return option === selected ? "wrong" : "dimmed";
}

/** Single-choice list of large radio rows; marked by the teacher once checked. */
export function ChoiceList({
  label,
  options,
  selected,
  disabled,
  onSelect,
  correctOptions,
}: ChoiceListProps) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.list}>
      {options.map((option) => (
        <ChoiceRow
          key={option}
          label={option}
          checked={option === selected}
          disabled={disabled || correctOptions !== undefined}
          mark={markOf(option, selected, correctOptions)}
          onPress={() => onSelect(option)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
});
