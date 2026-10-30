import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { palettes, spacing, type HighlighterName } from "./theme";
import { ThemeOverride } from "./use-theme";

/**
 * A sticky note stuck on the page, slightly rotated: the only rotated element in the app.
 * Highlighter-colored paper (yellow unless `color` says otherwise) with dark ink, in both color
 * schemes.
 */
export function StickyNote({
  color = "yellow",
  children,
}: {
  color?: HighlighterName;
  children: ReactNode;
}) {
  return (
    <View style={[styles.note, { backgroundColor: palettes.light.highlighters[color] }]}>
      <ThemeOverride scheme="light">{children}</ThemeOverride>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    gap: spacing.sm,
    padding: spacing.lg,
    transform: [{ rotate: "-1.5deg" }],
  },
});
