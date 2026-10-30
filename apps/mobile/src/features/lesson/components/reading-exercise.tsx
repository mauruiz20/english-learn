import type { Passage } from "@english-learn/content";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import { themedStyles } from "@/shared/ui/use-theme";
import { ChoiceList } from "./choice-list";
import { ExerciseLayout } from "./exercise-layout";
import type { ExerciseProps } from "./types";

type ReadingExerciseProps = ExerciseProps<"reading"> & { passage: Passage | undefined };

/** Passage followed by all its questions; checked together once every question has an answer. */
export function ReadingExercise({ prepared, passage, disabled, onSubmit }: ReadingExerciseProps) {
  const styles = useStyles();
  const [answers, setAnswers] = useState<readonly (string | null)[]>(() =>
    prepared.questions.map(() => null),
  );
  const complete = answers.every((a) => a !== null);
  return (
    <ExerciseLayout
      instruction="Lee el texto y responde"
      canSubmit={!disabled && complete}
      locked={disabled}
      onSubmit={() => onSubmit({ kind: "choices", options: answers.map((a) => a ?? "") })}
    >
      {/* A printed handout glued into the notebook. */}
      <View style={styles.passage}>
        {passage === undefined ? (
          <Text tone="muted">Texto no disponible.</Text>
        ) : (
          <>
            <Text accessibilityRole="header" variant="title">
              {passage.title}
            </Text>
            <Text style={styles.text}>{passage.text}</Text>
          </>
        )}
      </View>
      {prepared.questions.map((question, i) => (
        // Prompts may repeat; the question list is fixed for the exercise, so the index is stable.
        <View key={i} style={styles.question}>
          <Text variant="bodyStrong">{`${i + 1}. ${question.prompt}`}</Text>
          <ChoiceList
            label={question.prompt}
            options={question.options}
            selected={answers[i] ?? null}
            disabled={disabled}
            onSelect={(option) =>
              setAnswers((current) => current.map((a, j) => (j === i ? option : a)))
            }
          />
        </View>
      ))}
    </ExerciseLayout>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    passage: {
      gap: spacing.sm,
      padding: spacing.md,
      backgroundColor: colors.sheet,
      borderWidth: 1,
      borderColor: colors.rule,
      borderRadius: 2,
    },
    text: { fontSize: 18, lineHeight: 28 },
    question: { gap: spacing.sm },
  }),
);
