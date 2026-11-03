import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { MOTION, PRESS_SCALE } from "./motion";
import { usePressSound } from "./press-sound";
import { useReducedMotion } from "./use-reduced-motion";

type PressableScaleProps = PressableProps & {
  /** Layout of the scaling wrapper (e.g. `alignSelf`), since it is what sits in the parent. */
  wrapperStyle?: StyleProp<ViewStyle>;
  /**
   * Plays the soft press click (default). Off where the press plays its own sound: checking an
   * answer (the verdict), finishing a lesson (its completion), choosing an option (the tap).
   */
  pressSound?: boolean;
};

/**
 * A `Pressable` that shrinks a touch (to 97 %) while pressed, on touch and on web pointers alike:
 * the paper gives under the finger. The wrapper only scales; role, name and state stay on the
 * pressable itself. No movement with reduced motion, and no hover effect. Each press clicks
 * (`usePressSound`; nothing while disabled or with sounds off).
 */
export function PressableScale({
  wrapperStyle,
  pressSound = true,
  onPress,
  onPressIn,
  onPressOut,
  ...props
}: PressableScaleProps) {
  const reduced = useReducedMotion();
  const click = usePressSound();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[wrapperStyle, style]}>
      <Pressable
        {...props}
        onPress={
          onPress == null
            ? onPress
            : (event) => {
                if (pressSound) click();
                onPress(event);
              }
        }
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
