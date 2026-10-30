import { lookupEnabled } from "../model/lookup-policy";
import { Prompt } from "./exercise-layout";
import { SingleChoiceExercise } from "./single-choice-exercise";
import type { ExerciseProps } from "./types";

export function TranslationChoiceExercise({
  prepared,
  disabled,
  reveal = false,
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
      {/* The sentence is what is being translated: locked until the answer is checked. */}
      <Prompt
        text={prepared.exercise.sentence}
        lookup={{ enabled: lookupEnabled("translation_choice.sentence", reveal) }}
      />
    </SingleChoiceExercise>
  );
}
