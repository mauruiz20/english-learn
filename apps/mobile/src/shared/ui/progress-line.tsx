import { StyleSheet, View } from "react-native";
import { themedStyles } from "./use-theme";

type ProgressLineProps = {
  /** Completed amount, 0…max. */
  value: number;
  max: number;
  /** Accessible name, e.g. "Progreso de la lección". */
  label: string;
};

/** A thin ink line drawn over a ruled line: how far along something is. */
export function ProgressLine({ value, max, label }: ProgressLineProps) {
  const styles = useStyles();
  const ratio = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: value }}
      style={styles.track}
    >
      <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    track: { height: 3, borderRadius: 2, backgroundColor: colors.rule, overflow: "hidden" },
    fill: { height: 3, backgroundColor: colors.ink },
  }),
);
