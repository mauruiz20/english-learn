import type { Passage } from "@english-learn/content";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/shared/ui/theme";
import { ChoiceList } from "./choice-list";
import { ExerciseLayout, exerciseText } from "./exercise-layout";
import type { ExerciseProps } from "./types";

type ReadingExerciseProps = ExerciseProps<"reading"> & { passage: Passage | undefined };

/** Passage followed by all its questions; checked together once every question has an answer. */
export function ReadingExercise({ prepared, passage, disabled, onSubmit }: ReadingExerciseProps) {
  const [answers, setAnswers] = useState<readonly (string | null)[]>(() =>
    prepared.questions.map(() => null),
  );
  const complete = answers.every((a) => a !== null);

  return (
    <ExerciseLayout
      instruction="Lee el texto y responde"
      canSubmit={!disabled && complete}
      onSubmit={() => onSubmit({ kind: "choices", options: answers.map((a) => a ?? "") })}
    >
      <View style={styles.passage}>
        {passage === undefined ? (
          <Text style={exerciseText.hint}>Texto no disponible.</Text>
        ) : (
          <>
            <Text accessibilityRole="header" style={styles.title}>
              {passage.title}
            </Text>
            <Text style={styles.text}>{passage.text}</Text>
          </>
        )}
      </View>
      {prepared.questions.map((question, i) => (
        <View key={question.prompt} style={styles.question}>
          <Text style={styles.prompt}>{`${i + 1}. ${question.prompt}`}</Text>
          <ChoiceList
            label={question.prompt}
            options={question.options}
            selected={answers[i] ?? null}
            disabled={disabled}
            onSelect={(option) => setAnswers(answers.map((a, j) => (j === i ? option : a)))}
          />
        </View>
      ))}
    </ExerciseLayout>
  );
}

const styles = StyleSheet.create({
  passage: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  text: { fontSize: 17, lineHeight: 26, color: colors.text },
  question: { gap: spacing.sm },
  prompt: { fontSize: 17, fontWeight: "600", color: colors.text },
});
