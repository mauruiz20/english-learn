import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "./use-theme";

/**
 * Pencil doodles in the notebook's margins, for empty states only: what the learner sees when
 * there is nothing to do yet, never next to content. Hand-drawn paths (slightly wobbly on
 * purpose), in pencil: the muted text color at low contrast. Original art.
 */
const DOODLES = {
  /** A cup of coffee, steaming: nothing to review, take a break. */
  rest: [
    { d: "M29 30 C 36 27.4, 52 27.6, 60 30.2 C 52 32.8, 37 32.6, 29 30 Z" },
    {
      d: "M30 30.5 C 30.4 38, 31.6 47, 34.2 52 C 37 56.4, 52 56.2, 55 52.2 C 58 47, 59 38, 59.2 30.6",
    },
    { d: "M59 35.5 C 66.5 33.2, 69.5 38.4, 66.2 43.2 C 64.2 46.2, 60.4 47.4, 57.2 46.4" },
    { d: "M21 57.4 C 33 60.4, 56 60.6, 69 57.2" },
    { d: "M39.5 23.5 C 36.2 19.4, 42.6 16.2, 39.4 11" },
    { d: "M47.5 22.5 C 44.4 17.6, 51.2 14.4, 48.2 8.4" },
  ],
  /** A paper plane with a looping dotted trail: setting off. */
  plane: [
    { d: "M86 10 L 47.5 25 L 62 30.2 Z" },
    { d: "M86 10 L 62 30.2 L 67 43 Z" },
    { d: "M62 30.2 L 58.4 36.4" },
    {
      d: "M44 31 C 30 34.4, 20.4 43.6, 26 50.2 C 31.6 56.4, 41 46.8, 30.4 42.2 C 22 38.8, 14 46.4, 7.6 52.6",
      dashed: true,
    },
  ],
  /** A pencil finishing a squiggle: about this notebook. */
  pencil: [
    { d: "M34.2 46.2 L 74 12.4 L 82.2 20.6 L 42.4 54 Z" },
    { d: "M34.2 46.2 L 28.4 58.2 L 42.4 54" },
    { d: "M70.2 15.6 L 78.4 23.8" },
    { d: "M30.6 52.4 L 31.6 55.6 L 34.6 54.8" },
    { d: "M8 58.6 C 12.4 52.2, 16.6 62.4, 20.8 56.6 C 24 52.4, 26.4 60.2, 29 57.8" },
  ],
} as const;

export type DoodleName = keyof typeof DOODLES;

const WIDTH = 96;
const HEIGHT = 64;

export function Doodle({ name, size = 1 }: { name: DoodleName; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      testID={`doodle-${name}`}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.doodle}
    >
      <Svg width={WIDTH * size} height={HEIGHT * size} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        {DOODLES[name].map((stroke, i) => (
          <Path
            key={i}
            d={stroke.d}
            fill="none"
            stroke={colors.textMuted}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...("dashed" in stroke ? { strokeDasharray: "1.5 5" } : {})}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // Pencil, not ink: present but quiet.
  doodle: { alignSelf: "flex-start", opacity: 0.55 },
});
