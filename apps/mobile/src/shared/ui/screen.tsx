import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { MAX_CONTENT_WIDTH, colors, spacing } from "./theme";

/** Scrollable, centered page container with a heading. */
export function Screen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {children}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, alignItems: "center" },
  column: { width: "100%", maxWidth: MAX_CONTENT_WIDTH, gap: spacing.md },
  title: { fontSize: 28, fontWeight: "700", color: colors.text },
});
