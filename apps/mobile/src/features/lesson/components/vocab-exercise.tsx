import { Prompt } from "./exercise-layout";
import { SingleChoiceExercise } from "./single-choice-exercise";
import type { ExerciseProps } from "./types";

export function VocabExercise({
  prepared,
  disabled,
  reveal,
  onSubmit,
  submitLabel,
}: ExerciseProps<"vocab">) {
  return (
    <SingleChoiceExercise
      instruction="Elige el significado"
      label={prepared.exercise.prompt}
      options={prepared.options}
      correctOptions={[prepared.exercise.options[prepared.exercise.answerIndex] ?? ""]}
      disabled={disabled}
      reveal={reveal}
      onSubmit={onSubmit}
      submitLabel={submitLabel}
    >
      <Prompt text={prepared.exercise.prompt} />
    </SingleChoiceExercise>
  );
}
