import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { RULED_LINE_HEIGHT } from "./theme";
import { themedStyles } from "./use-theme";

/**
 * Faint ruled lines behind its content, one every `RULED_LINE_HEIGHT`. Text inside should use
 * that line height (see `ruledText`) so it sits on the lines. Used only behind exercise prompts.
 */
export function RuledArea({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const [height, setHeight] = useState(0);
  const lines = Math.max(1, Math.floor(height / RULED_LINE_HEIGHT));
  return (
    <View style={styles.area} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      <View
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
        {Array.from({ length: lines }, (_, i) => (
          <View key={i} style={[styles.line, { top: (i + 1) * RULED_LINE_HEIGHT - 1 }]} />
        ))}
      </View>
      {children}
    </View>
  );
}

/** Line height for text written on a `RuledArea`. */
export const ruledText = { lineHeight: RULED_LINE_HEIGHT } as const;

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    area: { minHeight: RULED_LINE_HEIGHT },
    line: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: colors.rule },
  }),
);
