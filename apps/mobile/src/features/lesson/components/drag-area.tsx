import type { ComponentProps, ReactNode } from "react";
import type { LayoutChangeEvent } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { ViewRef } from "./view-ref";

export type DragAreaProps = {
  enabled: boolean;
  /** How far the strip has been dragged, and how lifted it is (0–1). */
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  lift: SharedValue<number>;
  /** A drag started (after a few points of movement, so taps stay taps). */
  onStart: () => void;
  /** The strip was released `dx`, `dy` away from where the drag started. */
  onRelease: (dx: number, dy: number) => void;
  viewRef: (node: ViewRef | null) => void;
  onLayout: (event: LayoutChangeEvent) => void;
  style: ComponentProps<typeof Animated.View>["style"];
  children: ReactNode;
};

/**
 * The drag of a paper strip: a Gesture Handler pan (pointer capture on web, the UI thread on
 * native), active after a few points of movement so taps stay taps.
 */
export function DragArea({
  enabled,
  dragX,
  dragY,
  lift,
  onStart,
  onRelease,
  viewRef,
  onLayout,
  style,
  children,
}: DragAreaProps) {
  const pan = usePanGesture({
    enabled,
    minDistance: 6,
    onActivate: () => {
      "worklet";
      lift.set(withTiming(1, { duration: 120 }));
      scheduleOnRN(onStart);
    },
    onUpdate: (event) => {
      "worklet";
      dragX.set(event.translationX);
      dragY.set(event.translationY);
    },
    onDeactivate: (event) => {
      "worklet";
      lift.set(withTiming(0, { duration: 160 }));
      scheduleOnRN(onRelease, event.translationX, event.translationY);
    },
  });
  return (
    <GestureDetector gesture={pan}>
      <Animated.View ref={viewRef} onLayout={onLayout} style={style}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
