import { Prompt } from "./exercise-layout";
import { SingleChoiceExercise } from "./single-choice-exercise";
import type { ExerciseProps } from "./types";

export function TranslationChoiceExercise({
  prepared,
  disabled,
  onSubmit,
  submitLabel,
}: ExerciseProps<"translation_choice">) {
  return (
    <SingleChoiceExercise
      instruction="Elige la traducción correcta"
      label="Traducciones"
      options={prepared.options}
      disabled={disabled}
      onSubmit={onSubmit}
      submitLabel={submitLabel}
    >
      <Prompt text={prepared.exercise.sentence} />
    </SingleChoiceExercise>
  );
}
