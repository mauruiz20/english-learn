import { useState } from "react";
import { StyleSheet, TextInput } from "react-native";
import { RULED_LINE_HEIGHT, fonts, spacing } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { ExerciseLayout, Prompt } from "./exercise-layout";
import type { ExerciseProps } from "./types";

export function TranslateWriteExercise({
  prepared,
  disabled,
  onSubmit,
}: ExerciseProps<"translate_write">) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [text, setText] = useState("");
  const canSubmit = !disabled && text.trim().length > 0;
  const submit = () => canSubmit && onSubmit({ kind: "text", text });

  return (
    <ExerciseLayout
      instruction="Traduce al inglés"
      canSubmit={canSubmit}
      locked={disabled}
      onSubmit={submit}
    >
      <Prompt text={prepared.exercise.es} />
      {/* Written on a ruled line of the notebook, in ink. */}
      <TextInput
        accessibilityLabel="Tu traducción en inglés"
        placeholder="Escribe en inglés"
        placeholderTextColor={colors.textMuted}
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        editable={!disabled}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        returnKeyType="done"
        multiline={false}
        style={styles.input}
      />
    </ExerciseLayout>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    input: {
      minHeight: RULED_LINE_HEIGHT + spacing.md,
      paddingHorizontal: spacing.xs,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
      fontFamily: fonts.body,
      fontSize: 22,
      color: colors.ink,
      borderBottomWidth: 2,
      borderBottomColor: colors.ink,
    },
  }),
);
