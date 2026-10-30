import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/shared/ui/button";
import { colors, spacing } from "@/shared/ui/theme";

type ExerciseLayoutProps = {
  /** Spanish instruction, e.g. "Elige el significado". */
  instruction: string;
  children: ReactNode;
  canSubmit: boolean;
  onSubmit: () => void;
  submitLabel?: string | undefined;
};

/** Instruction + exercise body + "Comprobar" button shared by every exercise type. */
export function ExerciseLayout({
  instruction,
  children,
  canSubmit,
  onSubmit,
  submitLabel = "Comprobar",
}: ExerciseLayoutProps) {
  return (
    <View style={styles.layout}>
      <Text accessibilityRole="header" style={styles.instruction}>
        {instruction}
      </Text>
      {children}
      <Button label={submitLabel} disabled={!canSubmit} onPress={onSubmit} />
    </View>
  );
}

export const exerciseText = StyleSheet.create({
  sentence: { fontSize: 20, lineHeight: 28, fontWeight: "600", color: colors.text },
  hint: { fontSize: 16, lineHeight: 22, color: colors.textMuted, fontStyle: "italic" },
});

const styles = StyleSheet.create({
  layout: { gap: spacing.md },
  instruction: { fontSize: 16, fontWeight: "600", color: colors.textMuted },
});
