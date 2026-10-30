import { Text } from "react-native";
import { exerciseText } from "./exercise-layout";
import { SingleChoiceExercise } from "./single-choice-exercise";
import type { ExerciseProps } from "./types";

export function VocabExercise({
  prepared,
  disabled,
  onSubmit,
  submitLabel,
}: ExerciseProps<"vocab">) {
  return (
    <SingleChoiceExercise
      instruction="Elige el significado"
      label={prepared.exercise.prompt}
      options={prepared.options}
      disabled={disabled}
      onSubmit={onSubmit}
      submitLabel={submitLabel}
    >
      <Text style={exerciseText.sentence}>{prepared.exercise.prompt}</Text>
    </SingleChoiceExercise>
  );
}
