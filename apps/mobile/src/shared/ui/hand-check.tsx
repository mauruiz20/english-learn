import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { StrokeClip, usePenStroke } from "./pen-stroke";
import { useTheme } from "./use-theme";

const WIDTH = 22;
const HEIGHT = 18;
// A quick ballpoint check: a short dip, then the long flick up to the right, slightly curved.
const CHECK = "M2.5 10.5 C 4.5 11.5, 6.5 13.5, 8.5 16 C 11 10.5, 15 5.5, 20 2";

/** Drawing starts once the page has settled after coming back to it. */
const DRAW_DELAY_MS = 300;

/**
 * A hand-drawn check mark in the success ink. With `animate` it is drawn once, left to right
 * like a pen stroke (≈ 250 ms, after the page settles); otherwise, or with reduced motion, it is
 * already there. Decorative (the row's label says "completada").
 */
export function HandCheck({ animate = false, testID }: { animate?: boolean; testID?: string }) {
  const { colors } = useTheme();
  const progress = usePenStroke(animate, DRAW_DELAY_MS);
  return (
    <View
      testID={testID}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.box}
    >
      <StrokeClip progress={progress} width={WIDTH}>
        <Svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
          <Path
            d={CHECK}
            fill="none"
            stroke={colors.success}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </StrokeClip>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: WIDTH, height: HEIGHT },
});
