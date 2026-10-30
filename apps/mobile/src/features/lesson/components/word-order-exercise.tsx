import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { PaperStrip } from "@/shared/ui/paper-strip";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import { themedStyles } from "@/shared/ui/use-theme";
import { ExerciseLayout, Prompt } from "./exercise-layout";
import type { ExerciseProps } from "./types";

/** Tap tokens to build the sentence; tap a built token to send it back. Tokens are tracked by index. */
export function WordOrderExercise({ prepared, disabled, onSubmit }: ExerciseProps<"word_order">) {
  const styles = useStyles();
  const { tokens } = prepared;
  const [built, setBuilt] = useState<readonly number[]>([]);
  const pool = tokens.map((_, i) => i).filter((i) => !built.includes(i));
  const builtTokens = built.map((i) => tokens[i] ?? "");

  return (
    <ExerciseLayout
      instruction="Ordena las palabras"
      canSubmit={!disabled && pool.length === 0}
      locked={disabled}
      onSubmit={() => onSubmit({ kind: "tokens", tokens: builtTokens })}
    >
      {prepared.exercise.es !== undefined && <Prompt text={prepared.exercise.es} />}
      {/* The answer line: paper strips laid on a ruled line. */}
      <View accessibilityLabel="Tu frase" style={[styles.row, styles.answer]}>
        {built.length === 0 && <Text tone="muted">Toca las palabras en orden</Text>}
        {built.map((index, position) => (
          <PaperStrip
            key={index}
            label={`Quitar ${tokens[index] ?? ""}`}
            text={tokens[index] ?? ""}
            disabled={disabled}
            onPress={() => setBuilt(built.filter((_, p) => p !== position))}
          />
        ))}
      </View>
      <View accessibilityLabel="Palabras disponibles" style={[styles.row, styles.bank]}>
        {pool.map((index) => (
          <PaperStrip
            key={index}
            label={tokens[index] ?? ""}
            text={tokens[index] ?? ""}
            disabled={disabled}
            onPress={() => setBuilt([...built, index])}
          />
        ))}
      </View>
    </ExerciseLayout>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    answer: {
      minHeight: 64,
      alignItems: "center",
      paddingBottom: spacing.sm,
      borderBottomWidth: 2,
      borderBottomColor: colors.ink,
    },
    bank: { minHeight: 48 },
  }),
);
