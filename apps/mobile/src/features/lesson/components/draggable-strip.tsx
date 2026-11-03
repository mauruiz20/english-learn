import { useCallback, useRef, useState, type ReactNode } from "react";
import { StyleSheet, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { SETTLE_SPRING } from "@/shared/ui/motion";
import { PaperStrip } from "@/shared/ui/paper-strip";
import { useReducedMotion } from "@/shared/ui/use-reduced-motion";
import { useTheme } from "@/shared/ui/use-theme";
import type { Point } from "../model/word-order-line";
import { DragArea } from "./drag-area";
import type { ViewRef } from "./view-ref";

export type { ViewRef } from "./view-ref";

type DraggableStripProps = {
  token: number;
  label: string;
  text: string;
  disabled: boolean;
  lockedContent?: ReactNode;
  onPress: () => void;
  accessibilityActions?: readonly { name: string; label: string }[] | undefined;
  onAccessibilityAction?: ((actionName: string) => void) | undefined;
  /** Hands the strip's view to the exercise, which measures it when a drag starts. */
  register: (token: number, view: ViewRef | null) => void;
  onDragStart: (token: number) => void;
  /**
   * The strip was released `dx`, `dy` away from where it was. True when that moved it (the
   * exercise then re-renders it in its new place); false sends it back where it was.
   */
  onDrop: (token: number, dx: number, dy: number) => boolean;
  /** Where (window coordinates) this strip was just dropped: it settles from there. */
  landing?: Point | undefined;
};

/** How far a strip lifts off the page while dragged. */
const LIFT_SCALE = 1.06;

/**
 * A paper strip that can also be dragged: it lifts (slightly larger, with a soft shadow) under
 * the finger or pointer, and on release either lands in its new place, settling there with a
 * spring, or springs back. Tapping still works (the drag starts only after a few points of
 * movement) and remains the accessible way to move words. With reduced motion it follows the
 * finger but neither lifts nor springs.
 */
export function DraggableStrip({
  token,
  label,
  text,
  disabled,
  lockedContent,
  onPress,
  accessibilityActions,
  onAccessibilityAction,
  register,
  onDragStart,
  onDrop,
  landing,
}: DraggableStripProps) {
  const reduced = useReducedMotion();
  const { scheme } = useTheme();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const lift = useSharedValue(0);
  // The drag in progress, on top of `x`/`y` (where the strip was when grabbed: at rest, or
  // still springing into place).
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  // A strip that was just dropped stays invisible until it knows where it is, then flies in from
  // the drop point.
  const [settling, setSettling] = useState(landing !== undefined);
  const view = useRef<ViewRef | null>(null);
  const setView = useCallback(
    (node: ViewRef | null) => {
      view.current = node;
      register(token, node);
    },
    [register, token],
  );

  const start = () => {
    // Freeze any settling spring where it is: the strip stays under the pointer.
    x.set(x.value);
    y.set(y.value);
    onDragStart(token);
  };
  const release = (dx: number, dy: number) => {
    // Measured boxes include the offset the strip had when grabbed: only the drag moved it.
    if (onDrop(token, dx, dy)) return;
    // Not moved: spring back from where it was let go.
    x.set(x.value + dx);
    y.set(y.value + dy);
    dragX.set(0);
    dragY.set(0);
    x.set(reduced ? 0 : withSpring(0, SETTLE_SPRING));
    y.set(reduced ? 0 : withSpring(0, SETTLE_SPRING));
  };

  const onLayout = (_event: LayoutChangeEvent) => {
    if (!settling || landing === undefined || view.current === null) return;
    view.current.measureInWindow((left, top) => {
      if (!reduced) {
        x.set(landing.x - left);
        y.set(landing.y - top);
        x.set(withSpring(0, SETTLE_SPRING));
        y.set(withSpring(0, SETTLE_SPRING));
      }
      setSettling(false);
    });
  };

  const moved = useAnimatedStyle(() => ({
    zIndex: lift.value > 0 ? 10 : 0,
    transform: [
      { translateX: x.value + dragX.value },
      { translateY: y.value + dragY.value },
      { scale: reduced ? 1 : 1 + (LIFT_SCALE - 1) * lift.value },
    ],
  }));
  const shadow = useAnimatedStyle(() => ({ opacity: reduced ? 0 : lift.value }));

  return (
    <DragArea
      enabled={!disabled}
      dragX={dragX}
      dragY={dragY}
      lift={lift}
      onStart={start}
      onRelease={release}
      viewRef={setView}
      onLayout={onLayout}
      style={[moved, settling && styles.hidden]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.shadow,
          { backgroundColor: scheme === "dark" ? "#020611" : "rgba(27, 35, 51, 0.22)" },
          shadow,
        ]}
      />
      <PaperStrip
        label={label}
        text={text}
        disabled={disabled}
        lockedContent={lockedContent}
        onPress={onPress}
        // The exercise taps when a strip moves (`WordOrderExercise`): no press click on top.
        pressSound={false}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={
          onAccessibilityAction === undefined
            ? undefined
            : (event) => onAccessibilityAction(event.nativeEvent.actionName)
        }
      />
    </DragArea>
  );
}

const styles = StyleSheet.create({
  hidden: { opacity: 0 },
  // A soft shadow under the lifted strip, as if it hovered above the page.
  shadow: {
    position: "absolute",
    top: 6,
    left: 4,
    right: -4,
    bottom: -6,
    borderRadius: 3,
  },
});
