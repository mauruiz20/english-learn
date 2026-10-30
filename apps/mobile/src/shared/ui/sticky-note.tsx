import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { palettes, spacing } from "./theme";
import { ThemeOverride } from "./use-theme";

/**
 * A yellow sticky note stuck on the page, slightly rotated: the only rotated element in the
 * app. Always yellow paper with dark ink, in both color schemes.
 */
export function StickyNote({ children }: { children: ReactNode }) {
  return (
    <View style={styles.note}>
      <ThemeOverride scheme="light">{children}</ThemeOverride>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: palettes.light.highlighter,
    transform: [{ rotate: "-1.5deg" }],
  },
});
