import { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";
import { colors, radius, spacing } from "@/shared/ui/theme";
import { ExerciseLayout, exerciseText } from "./exercise-layout";
import type { ExerciseProps } from "./types";

export function TranslateWriteExercise({
  prepared,
  disabled,
  onSubmit,
}: ExerciseProps<"translate_write">) {
  const [text, setText] = useState("");
  const canSubmit = !disabled && text.trim().length > 0;
  const submit = () => canSubmit && onSubmit({ kind: "text", text });

  return (
    <ExerciseLayout instruction="Traduce al inglés" canSubmit={canSubmit} onSubmit={submit}>
      <Text style={exerciseText.sentence}>{prepared.exercise.es}</Text>
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

const styles = StyleSheet.create({
  input: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    fontSize: 18,
    color: colors.text,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
