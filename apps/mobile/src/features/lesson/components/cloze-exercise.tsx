import { Text } from "react-native";
import { exerciseText } from "./exercise-layout";
import { SingleChoiceExercise } from "./single-choice-exercise";
import type { ExerciseProps } from "./types";

export function ClozeExercise({ prepared, disabled, onSubmit }: ExerciseProps<"cloze">) {
  const { sentence, es } = prepared.exercise;
  return (
    <SingleChoiceExercise
      instruction="Completa la frase"
      label="Palabra para el espacio"
      options={prepared.options}
      disabled={disabled}
      onSubmit={onSubmit}
    >
      <Text style={exerciseText.sentence}>{sentence}</Text>
      {es !== undefined && <Text style={exerciseText.hint}>{es}</Text>}
    </SingleChoiceExercise>
  );
}
