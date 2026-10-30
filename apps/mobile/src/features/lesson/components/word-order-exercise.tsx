import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/shared/ui/theme";
import { ExerciseLayout, exerciseText } from "./exercise-layout";
import type { ExerciseProps } from "./types";

type TokenProps = { label: string; text: string; disabled: boolean; onPress: () => void };

function Token({ label, text, disabled, onPress }: TokenProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.token, pressed && styles.pressed]}
    >
      <Text style={styles.tokenText}>{text}</Text>
    </Pressable>
  );
}

/** Tap tokens to build the sentence; tap a built token to send it back. Tokens are tracked by index. */
export function WordOrderExercise({ prepared, disabled, onSubmit }: ExerciseProps<"word_order">) {
  const { tokens } = prepared;
  const [built, setBuilt] = useState<readonly number[]>([]);
  const pool = tokens.map((_, i) => i).filter((i) => !built.includes(i));
  const builtTokens = built.map((i) => tokens[i] ?? "");

  return (
    <ExerciseLayout
      instruction="Ordena las palabras"
      canSubmit={!disabled && pool.length === 0}
      onSubmit={() => onSubmit({ kind: "tokens", tokens: builtTokens })}
    >
      {prepared.exercise.es !== undefined && (
        <Text style={exerciseText.sentence}>{prepared.exercise.es}</Text>
      )}
      <View accessibilityLabel="Tu frase" style={[styles.row, styles.answer]}>
        {built.length === 0 && <Text style={exerciseText.hint}>Toca las palabras en orden</Text>}
        {built.map((index, position) => (
          <Token
            key={index}
            label={`Quitar ${tokens[index] ?? ""}`}
            text={tokens[index] ?? ""}
            disabled={disabled}
            onPress={() => setBuilt(built.filter((_, p) => p !== position))}
          />
        ))}
      </View>
      <View accessibilityLabel="Palabras disponibles" style={styles.row}>
        {pool.map((index) => (
          <Token
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

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  answer: {
    minHeight: 64,
    alignItems: "center",
    padding: spacing.sm,
    borderBottomWidth: 2,
    borderColor: colors.border,
  },
  token: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.8 },
  tokenText: { fontSize: 18, color: colors.text },
});
