import { DAILY_GOALS, type DailyGoal } from "@english-learn/domain";
import { StyleSheet, View } from "react-native";
import { Button } from "@/shared/ui/button";
import { Text } from "@/shared/ui/text";
import { radius, spacing } from "@/shared/ui/theme";
import { themedStyles } from "@/shared/ui/use-theme";
import { goalChoiceLabel } from "./model/daily-goal-copy";

/**
 * The one-time note under home's progress card that offers to pick a daily goal. It blocks
 * nothing: the default goal already counts, and "Ahora no" just closes it.
 */
export function DailyGoalPrompt({
  onChoose,
  onDismiss,
}: {
  onChoose: (goal: DailyGoal) => void;
  onDismiss: () => void;
}) {
  const styles = useStyles();
  return (
    <View testID="daily-goal-prompt" style={styles.note}>
      <Text variant="bodyStrong" accessibilityRole="header">
        ¿Cuánto quieres practicar cada día?
      </Text>
      <Text tone="muted">
        Elige una meta diaria de ejercicios. Puedes cambiarla cuando quieras.
      </Text>
      <View style={styles.options}>
        {DAILY_GOALS.map((goal) => (
          <Button
            key={goal}
            label={goalChoiceLabel(goal)}
            variant="secondary"
            onPress={() => onChoose(goal)}
          />
        ))}
      </View>
      <Button label="Ahora no" variant="text" onPress={onDismiss} />
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    note: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: colors.ink,
      backgroundColor: colors.sheet,
    },
    options: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  }),
);
