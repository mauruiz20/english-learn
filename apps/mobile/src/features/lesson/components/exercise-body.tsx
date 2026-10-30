import type { Passage } from "@english-learn/content";
import { View } from "react-native";
import type { PreparedExercise } from "../model/prepare-exercise";
import type { ExerciseResponse } from "../model/response";
import { ClozeExercise } from "./cloze-exercise";
import { ReadingExercise } from "./reading-exercise";
import { TranslateWriteExercise } from "./translate-write-exercise";
import { TranslationChoiceExercise } from "./translation-choice-exercise";
import { VocabExercise } from "./vocab-exercise";
import { WordOrderExercise } from "./word-order-exercise";

type ExerciseBodyProps = {
  prepared: PreparedExercise;
  /** The passage of a reading exercise. */
  passage: Passage | undefined;
  disabled: boolean;
  /** Label of the submit button of choice exercises; defaults to "Comprobar". */
  submitLabel?: string | undefined;
  onSubmit: (response: ExerciseResponse) => void;
};

/**
 * Renders the component for the exercise's type. Shared by lessons, review and placement.
 * The `testID` carries the exercise id (harmless in production; lets e2e tests look up answers).
 */
export function ExerciseBody({
  prepared,
  passage,
  disabled,
  submitLabel,
  onSubmit,
}: ExerciseBodyProps) {
  const common = { disabled, onSubmit };
  const choice = { ...common, submitLabel };
  return (
    <View testID={`exercise-${prepared.exercise.id}`}>
      {(() => {
        switch (prepared.type) {
          case "vocab":
            return <VocabExercise prepared={prepared} {...choice} />;
          case "cloze":
            return <ClozeExercise prepared={prepared} {...choice} />;
          case "translation_choice":
            return <TranslationChoiceExercise prepared={prepared} {...choice} />;
          case "word_order":
            return <WordOrderExercise prepared={prepared} {...common} />;
          case "reading":
            return <ReadingExercise prepared={prepared} passage={passage} {...common} />;
          case "translate_write":
            return <TranslateWriteExercise prepared={prepared} {...common} />;
        }
      })()}
    </View>
  );
}
