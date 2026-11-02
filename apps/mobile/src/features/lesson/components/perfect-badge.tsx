import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Sticker } from "@/shared/ui/sticker";
import { useTheme } from "@/shared/ui/use-theme";

/**
 * A small yellow star sticker for a lesson or card done with every answer right (yellow means
 * "correct"). Decorative: whatever shows it says it in its own label. Never animated.
 */
export function PerfectBadge({
  testID,
  size = 30,
  style,
}: {
  testID?: string;
  /** The sticker's size; the star scales with it. */
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const star = Math.round((size * 16) / 30);
  return (
    <View
      testID={testID}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={style}
    >
      <Sticker color="yellow" size={size} tilt={10}>
        <Svg width={star} height={star} viewBox="0 0 24 24">
          <Path
            d="M12 3 14.6 9 21 9.6 16.2 13.8 17.6 20.2 12 16.9 6.4 20.2 7.8 13.8 3 9.6 9.4 9Z"
            fill={colors.onHighlighter}
          />
        </Svg>
      </Sticker>
    </View>
  );
}
