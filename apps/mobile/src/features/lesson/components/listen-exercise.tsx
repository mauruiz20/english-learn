import type { SpeechRate } from "@english-learn/domain";
import { useId, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { usePronunciation } from "@/features/pronunciation/pronunciation";
import { SpeakerGlyph } from "@/features/pronunciation/speak-button";
import { PressableScale } from "@/shared/ui/pressable-scale";
import { Text } from "@/shared/ui/text";
import { RULED_LINE_HEIGHT, fonts, radius, spacing } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { ChoiceList } from "./choice-list";
import { ExerciseLayout, Prompt } from "./exercise-layout";
import type { ExerciseProps } from "./types";

/**
 * "Escucha y escribe" / "Escucha y elige": the sentence is never shown before the check; two
 * ink buttons play it at the learner's speed ("Escuchar") and slowly ("Más lento"). Nothing plays
 * on its own: iOS speaks only from a tap. If it cannot be heard (pronunciation switched off or no
 * voice since the session started), the sentence is shown instead, so the exercise still works.
 */
export function ListenExerciseView({
  prepared,
  disabled,
  reveal = false,
  onSubmit,
  submitLabel,
}: ExerciseProps<"listen">) {
  const { exercise, options } = prepared;
  const { available } = usePronunciation();
  const styles = useStyles();
  const { colors } = useTheme();
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const write = exercise.mode === "write";
  const canSubmit = !disabled && (write ? text.trim().length > 0 : selected !== null);
  const submit = () => {
    if (!canSubmit) return;
    onSubmit(write ? { kind: "text", text } : { kind: "choice", option: selected ?? "" });
  };

  return (
    <ExerciseLayout
      instruction={write ? "Escucha y escribe" : "Escucha y elige"}
      canSubmit={canSubmit}
      locked={disabled}
      submitLabel={submitLabel}
      onSubmit={submit}
    >
      {available ? (
        <View style={styles.players}>
          <PlayButton sentence={exercise.sentence} label="Escuchar" a11y="Escuchar la frase" />
          <PlayButton
            sentence={exercise.sentence}
            label="Más lento"
            a11y="Escuchar más lento"
            rate="slow"
          />
        </View>
      ) : (
        <Prompt text={exercise.sentence} />
      )}
      {write ? (
        <TextInput
          accessibilityLabel="Lo que escuchaste, en inglés"
          placeholder="Escribe lo que oyes"
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          editable={!disabled}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          returnKeyType="done"
          multiline={false}
          style={styles.input}
        />
      ) : (
        <ChoiceList
          label="¿Qué frase escuchaste?"
          options={options}
          selected={selected}
          disabled={disabled}
          onSelect={setSelected}
          correctOptions={reveal ? [exercise.sentence] : undefined}
          lookup={reveal}
        />
      )}
    </ExerciseLayout>
  );
}

/** A round ink button with a speaker and its word under it; filled while it speaks. */
function PlayButton({
  sentence,
  label,
  a11y,
  rate,
}: {
  sentence: string;
  label: string;
  a11y: string;
  rate?: SpeechRate;
}) {
  const { speak, speakingKey } = usePronunciation();
  const key = useId();
  const styles = useStyles();
  const { colors } = useTheme();
  const speaking = speakingKey === key;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ busy: speaking }}
      pressSound={false}
      onPress={() => speak(sentence, key, rate)}
      style={({ pressed }) => [styles.play, (speaking || pressed) && styles.playActive]}
    >
      <SpeakerGlyph color={speaking ? colors.onInk : colors.ink} size={28} />
      <Text variant="smallStrong" style={{ color: speaking ? colors.onInk : colors.ink }}>
        {label}
      </Text>
    </PressableScale>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    players: { flexDirection: "row", gap: spacing.md, justifyContent: "center" },
    play: {
      minWidth: 112,
      minHeight: 88,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.ink,
      backgroundColor: colors.sheet,
    },
    playActive: { backgroundColor: colors.ink },
    input: {
      minHeight: RULED_LINE_HEIGHT + spacing.md,
      paddingHorizontal: spacing.xs,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
      fontFamily: fonts.body,
      fontSize: 22,
      color: colors.ink,
      borderBottomWidth: 2,
      borderBottomColor: colors.ink,
    },
  }),
);
