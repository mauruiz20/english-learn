import { useGlossary } from "@/features/glossary/glossary-provider";
import { lookupEnabled, vocabLocks, vocabOptionsAreEnglish } from "../model/lookup-policy";
import { Prompt } from "./exercise-layout";
import { SingleChoiceExercise } from "./single-choice-exercise";
import type { ExerciseProps } from "./types";

export function VocabExercise({
  prepared,
  disabled,
  reveal = false,
  onSubmit,
  submitLabel,
}: ExerciseProps<"vocab">) {
  const index = useGlossary()?.index;
  const { prompt } = prepared.exercise;
  // The quoted term is what is evaluated: locked until the answer is checked.
  const locks = index === undefined ? undefined : vocabLocks(prompt, index, reveal);
  return (
    <SingleChoiceExercise
      instruction="Elige el significado"
      label={prompt}
      options={prepared.options}
      correctOptions={[prepared.exercise.options[prepared.exercise.answerIndex] ?? ""]}
      disabled={disabled}
      reveal={reveal}
      onSubmit={onSubmit}
      submitLabel={submitLabel}
      lookupOptions={vocabOptionsAreEnglish(prompt) && lookupEnabled("vocab.options", reveal)}
    >
      <Prompt
        text={prompt}
        lookup={
          locks === undefined
            ? undefined
            : { enabled: lookupEnabled("vocab.prompt", reveal), ...locks }
        }
      />
    </SingleChoiceExercise>
  );
}
