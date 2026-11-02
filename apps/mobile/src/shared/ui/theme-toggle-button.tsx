import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { PressableScale } from "./pressable-scale";
import { Text } from "./text";
import { TOUCH_TARGET } from "./theme";
import { THEME_PREFERENCE_NAMES, type ThemePreference } from "./theme-preference";
import { themedStyles, useTheme } from "./use-theme";

type ThemeToggleButtonProps = {
  preference: ThemePreference;
  /** Moves to the next preference (Sistema → Claro → Oscuro → Sistema). */
  onCycle: () => void;
};

/**
 * The theme switch, next to the sound one in the home header and drawn in the same pen: a sun
 * (Claro), a moon (Oscuro) or a half-inked circle (Sistema, following the device). Its label
 * names the current theme and what pressing does ("Tema: Sistema. Cambiar tema"); after a press,
 * screen readers hear the new one ("Tema: Oscuro").
 */
export function ThemeToggleButton({ preference, onCycle }: ThemeToggleButtonProps) {
  const styles = useStyles();
  const [changed, setChanged] = useState(false);
  const name = THEME_PREFERENCE_NAMES[preference];
  const announcement = changed ? `Tema: ${name}` : "";
  useEffect(() => {
    // iOS has no live regions: VoiceOver is told directly.
    if (announcement !== "" && Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(announcement);
    }
  }, [announcement]);
  const press = () => {
    setChanged(true);
    onCycle();
  };
  return (
    <View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`Tema: ${name}. Cambiar tema`}
        onPress={press}
        hitSlop={4}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <ThemeIcon preference={preference} />
      </PressableScale>
      {/* The confirmation: read by screen readers (web and Android live region), invisible. */}
      <Text accessibilityLiveRegion="polite" style={styles.announcement}>
        {announcement}
      </Text>
    </View>
  );
}

const SIZE = 24;
const STROKE = 2;
const SUN_RAYS = [0, 45, 90, 135, 180, 225, 270, 315].map((degrees) => {
  const angle = (degrees * Math.PI) / 180;
  const [x1, y1, x2, y2] = [7.5, 7.5, 10.5, 10.5].map((r, i) =>
    i % 2 === 0 ? 12 + r * Math.cos(angle) : 12 + r * Math.sin(angle),
  ) as [number, number, number, number];
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)}`;
});

function ThemeIcon({ preference }: { preference: ThemePreference }) {
  const { colors } = useTheme();
  const ink = { stroke: colors.ink, strokeWidth: STROKE, strokeLinecap: "round" } as const;
  return (
    <View
      testID={`theme-icon-${preference}`}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {preference === "light" && (
          <>
            <Circle cx={12} cy={12} r={4} fill="none" {...ink} />
            <Path d={SUN_RAYS.join(" ")} fill="none" {...ink} />
          </>
        )}
        {preference === "dark" && (
          <Path
            d="M19.5 14.5 A8 8 0 1 1 9.5 4.5 A6.5 6.5 0 0 0 19.5 14.5 Z"
            fill="none"
            strokeLinejoin="round"
            {...ink}
          />
        )}
        {preference === "system" && (
          <>
            <Circle cx={12} cy={12} r={8} fill="none" {...ink} />
            <Path d="M12 4 A8 8 0 0 1 12 20 Z" fill={colors.ink} />
          </>
        )}
      </Svg>
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    button: {
      width: TOUCH_TARGET,
      height: TOUCH_TARGET,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: TOUCH_TARGET / 2,
    },
    pressed: { backgroundColor: colors.rule },
    // Read by screen readers, invisible on screen.
    announcement: {
      position: "absolute",
      width: 1,
      height: 1,
      overflow: "hidden",
      color: "transparent",
    },
  }),
);
