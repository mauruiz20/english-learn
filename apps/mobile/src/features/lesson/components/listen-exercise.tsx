import { useId, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { usePronunciation } from "@/features/pronunciation/pronunciation";
import { SpeakerGlyph } from "@/features/pronunciation/speak-button";
import { PressableScale } from "@/shared/ui/pressable-scale";
import { Sticker } from "@/shared/ui/sticker";
import { Text } from "@/shared/ui/text";
import { RULED_LINE_HEIGHT, fonts, radius, spacing } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { ChoiceList } from "./choice-list";
import { ExerciseLayout, Prompt } from "./exercise-layout";
import type { ExerciseProps } from "./types";

/**
 * "Escucha y escribe" / "Escucha y elige": the sentence is never shown before the check; two
 * ink buttons play it at the learner's speed ("Escuchar", a speaker) and one step slower ("Más
 * lento", a tortoise sticker: 0.7, or 0.5 when the learner already picked "Lenta"). Each button
 * always plays at its own speed, however often it is tapped. Nothing plays
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
            slower
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

/**
 * A round ink button with its picture and word under it; filled while it speaks. "Escuchar"
 * shows a speaker; "Más lento" (`slower`) a tortoise sticker.
 */
function PlayButton({
  sentence,
  label,
  a11y,
  slower = false,
}: {
  sentence: string;
  label: string;
  a11y: string;
  slower?: boolean;
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
      // Called inside the tap: iOS speaks only from a user gesture.
      onPress={() => speak(sentence, key, { slower })}
      style={({ pressed }) => [styles.play, (speaking || pressed) && styles.playActive]}
    >
      {slower ? (
        <Sticker color="green" size={40} tilt={-6} testID="listen-slower-tortoise">
          <TortoiseGlyph color={colors.onHighlighter} />
        </Sticker>
      ) : (
        <SpeakerGlyph color={speaking ? colors.onInk : colors.ink} size={28} />
      )}
      <Text variant="smallStrong" style={{ color: speaking ? colors.onInk : colors.ink }}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** A pen-drawn tortoise walking right: the slow one (decorative). */
function TortoiseGlyph({ color }: { color: string }) {
  return (
    <Svg width={28} height={28} viewBox="0 0 28 28">
      <Path
        d="M5 17c0-5 3.6-8.5 8.5-8.5S22 12 22 17z"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path
        d="M9.5 10.5 13.5 17M17.5 10.5 13.5 17M5.5 17h16.5"
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Path
        d="M22 15.5c1.2-2.4 4-2.2 4 .2 0 1.4-1.3 2-2.6 1.6M8 17v3M19 17v3M5 16.5 3 18"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={24.6} cy={15.2} r={0.7} fill={color} />
    </Svg>
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
