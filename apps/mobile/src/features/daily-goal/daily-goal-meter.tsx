import { DAILY_GOALS, type DailyGoal, type DailyGoalStatus } from "@english-learn/domain";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { ChoiceRow } from "@/shared/ui/choice-row";
import { PressableScale } from "@/shared/ui/pressable-scale";
import { Sticker } from "@/shared/ui/sticker";
import { Text } from "@/shared/ui/text";
import { radius, spacing } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { GoalRing } from "./goal-ring";
import { goalChoiceLabel, goalProgressLabel, goalProgressText } from "./model/daily-goal-copy";

const STAR = "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z";

/**
 * The daily goal in home's progress card, under the streak: a ring with "12 / 20 hoy" (or
 * "¡Meta cumplida!" and a small star sticker), and a chip that opens the goals as radios right
 * under it. Without a goal only the chip stays. Nothing animates: missing the goal changes
 * nothing, and meeting it is a sticker, not a show.
 */
export function DailyGoalMeter({
  goal,
  status,
  onChoose,
}: {
  goal: DailyGoal;
  status: DailyGoalStatus;
  onChoose: (goal: DailyGoal) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const pick = (next: DailyGoal) => {
    setOpen(false);
    onChoose(next);
  };
  return (
    <View testID="daily-goal" style={styles.goal}>
      <View style={styles.row}>
        {status.kind === "on" && (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={goalProgressLabel(status)}
            accessibilityValue={{
              min: 0,
              max: status.target,
              now: Math.min(status.done, status.target),
            }}
            style={styles.meter}
          >
            <GoalRing done={status.done} target={status.target} />
            <View style={styles.meterText}>
              <Text variant="smallStrong" tone="muted">
                Meta diaria
              </Text>
              <Text variant="title" tone="ink">
                {goalProgressText(status)}
              </Text>
            </View>
            {status.met && (
              <Sticker testID="daily-goal-sticker" color="yellow" size={34} tilt={8}>
                <Svg width={16} height={16} viewBox="0 0 24 24">
                  <Path
                    d={STAR}
                    fill={colors.onHighlighter}
                    stroke={colors.onHighlighter}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                </Svg>
              </Sticker>
            )}
          </View>
        )}
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`Meta diaria: ${goalChoiceLabel(goal)}`}
          accessibilityHint="Muestra las metas para elegir cuánto practicar cada día"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((was) => !was)}
          wrapperStyle={styles.chipWrapper}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
        >
          <Text variant="smallStrong" tone="ink">
            {status.kind === "on" ? goalChoiceLabel(goal) : `Meta diaria: ${goalChoiceLabel(goal)}`}
          </Text>
          <Text variant="smallStrong" tone="ink" importantForAccessibility="no">
            {open ? "▴" : "▾"}
          </Text>
        </PressableScale>
      </View>
      {open && (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Meta diaria"
          style={styles.options}
        >
          {DAILY_GOALS.map((option) => (
            <ChoiceRow
              key={option}
              label={goalChoiceLabel(option)}
              checked={option === goal}
              disabled={false}
              onPress={() => pick(option)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    goal: { gap: spacing.sm },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    meter: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexShrink: 1 },
    meterText: { flexShrink: 1 },
    chipWrapper: { alignSelf: "center" },
    chip: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: colors.ink,
      backgroundColor: colors.sheet,
    },
    chipPressed: { backgroundColor: colors.rule },
    options: { gap: spacing.sm },
  }),
);
