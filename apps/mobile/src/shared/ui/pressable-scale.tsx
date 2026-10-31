import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { MOTION, PRESS_SCALE } from "./motion";
import { useReducedMotion } from "./use-reduced-motion";

type PressableScaleProps = PressableProps & {
  /** Layout of the scaling wrapper (e.g. `alignSelf`), since it is what sits in the parent. */
  wrapperStyle?: StyleProp<ViewStyle>;
};

/**
 * A `Pressable` that shrinks a touch (to 97 %) while pressed, on touch and on web pointers alike:
 * the paper gives under the finger. The wrapper only scales; role, name and state stay on the
 * pressable itself. No movement with reduced motion, and no hover effect.
 */
export function PressableScale({
  wrapperStyle,
  onPressIn,
  onPressOut,
  ...props
}: PressableScaleProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[wrapperStyle, style]}>
      <Pressable
        {...props}
        onPressIn={(event) => {
          if (!reduced) scale.set(withTiming(PRESS_SCALE, { duration: MOTION.press }));
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          scale.set(reduced ? 1 : withTiming(1, { duration: MOTION.press * 1.5 }));
          onPressOut?.(event);
        }}
      />
    </Animated.View>
  );
}
