import { Prompt } from "./exercise-layout";
import { SingleChoiceExercise } from "./single-choice-exercise";
import type { ExerciseProps } from "./types";

export function TranslationChoiceExercise({
  prepared,
  disabled,
  reveal,
  onSubmit,
  submitLabel,
}: ExerciseProps<"translation_choice">) {
  return (
    <SingleChoiceExercise
      instruction="Elige la traducción correcta"
      label="Traducciones"
      options={prepared.options}
      correctOptions={[prepared.exercise.options[prepared.exercise.answerIndex] ?? ""]}
      disabled={disabled}
      reveal={reveal}
      onSubmit={onSubmit}
      submitLabel={submitLabel}
    >
      <Prompt text={prepared.exercise.sentence} />
    </SingleChoiceExercise>
  );
}
