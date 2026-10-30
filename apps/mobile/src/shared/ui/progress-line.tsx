import { StyleSheet, View } from "react-native";
import type { HighlighterName } from "./theme";
import { themedStyles, useTheme } from "./use-theme";

type ProgressLineProps = {
  /** Completed amount, 0…max. */
  value: number;
  max: number;
  /** Accessible name, e.g. "Progreso de la lección". */
  label: string;
  /** Draw the done part with this highlighter (e.g. the lesson's topic) under the ink line. */
  tint?: HighlighterName | undefined;
};

/**
 * A thin ink line drawn over a ruled line: how far along something is. Tinted, the done part is
 * also swiped with a highlighter, the ink line still marking it on top.
 */
export function ProgressLine({ value, max, label, tint }: ProgressLineProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const ratio = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  const width = `${ratio * 100}%` as const;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: value }}
      style={[styles.track, tint !== undefined && styles.tintedTrack]}
    >
      {tint !== undefined && (
        <>
          <View style={styles.rule} />
          <View style={[styles.band, { width, backgroundColor: colors.highlighters[tint] }]} />
        </>
      )}
      <View style={[styles.fill, { width }]} />
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    track: {
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.rule,
      overflow: "hidden",
      justifyContent: "flex-end",
    },
    // Room for the highlighter band; the ruled line and the ink stay 3 pt at the bottom.
    tintedTrack: { height: 9, backgroundColor: "transparent" },
    rule: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 3,
      backgroundColor: colors.rule,
    },
    band: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 2 },
    fill: { height: 3, backgroundColor: colors.ink },
  }),
);
