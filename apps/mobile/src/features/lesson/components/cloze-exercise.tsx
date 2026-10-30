import { StyleSheet, View } from "react-native";
import { GlossaryRuns } from "@/features/glossary/glossary-text";
import { Text } from "@/shared/ui/text";
import { useTheme } from "@/shared/ui/use-theme";
import { lookupEnabled } from "../model/lookup-policy";
import { Prompt, exerciseText } from "./exercise-layout";
import { SingleChoiceExercise } from "./single-choice-exercise";
import type { ExerciseProps } from "./types";

const BLANK = /_{2,}/;

export function ClozeExercise({
  prepared,
  disabled,
  reveal = false,
  onSubmit,
  submitLabel,
}: ExerciseProps<"cloze">) {
  const { colors } = useTheme();
  const { sentence, es } = prepared.exercise;
  const parts = sentence.split(BLANK);
  return (
    <SingleChoiceExercise
      instruction="Completa la frase"
      label="Palabra para el espacio"
      options={prepared.options}
      correctOptions={prepared.exercise.answers}
      disabled={disabled}
      reveal={reveal}
      onSubmit={onSubmit}
      submitLabel={submitLabel}
      lookupOptions={lookupEnabled("cloze.options", reveal)}
    >
      <Prompt hint={es}>
        {/* The blank is drawn as an empty, underlined space; screen readers get the sentence. */}
        <Text accessibilityLabel={sentence} style={exerciseText.sentence}>
          {parts.map((part, i) => (
            <Text key={i} style={exerciseText.sentence}>
              <GlossaryRuns text={part} enabled={lookupEnabled("cloze.sentence", reveal)} />
              {i < parts.length - 1 && (
                <View style={[styles.blank, { backgroundColor: colors.ink }]} />
              )}
            </Text>
          ))}
        </Text>
      </Prompt>
    </SingleChoiceExercise>
  );
}

const styles = StyleSheet.create({
  // A gap to fill in by hand: an inline ink underline, a little uneven at the ends.
  blank: {
    width: 88,
    height: 2.5,
    marginHorizontal: 6,
    borderTopLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
});
