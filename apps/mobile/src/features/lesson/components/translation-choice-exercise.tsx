import { Text } from "react-native";
import { exerciseText } from "./exercise-layout";
import { SingleChoiceExercise } from "./single-choice-exercise";
import type { ExerciseProps } from "./types";

export function TranslationChoiceExercise({
  prepared,
  disabled,
  onSubmit,
}: ExerciseProps<"translation_choice">) {
  return (
    <SingleChoiceExercise
      instruction="Elige la traducción correcta"
      label="Traducciones"
      options={prepared.options}
      disabled={disabled}
      onSubmit={onSubmit}
    >
      <Text style={exerciseText.sentence}>{prepared.exercise.sentence}</Text>
    </SingleChoiceExercise>
  );
}
