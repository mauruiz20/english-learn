import type { SpeechRate } from "@english-learn/domain";
import { useId, useRef } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { PressableScale } from "@/shared/ui/pressable-scale";
import { TOUCH_TARGET } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { usePronunciation } from "./pronunciation";

type SpeakButtonProps = {
  /** The English text to say. */
  text: string;
  /** Accessible name; defaults to "Escuchar: <text>" (a long passage gets a shorter one). */
  label?: string | undefined;
  style?: StyleProp<ViewStyle>;
};

const other = (rate: SpeechRate): SpeechRate => (rate === "normal" ? "slow" : "normal");

/** What the next tap does, for the hint. */
function hintFor(rate: SpeechRate): string {
  return rate === "normal"
    ? "Toca otra vez para escucharlo más lento"
    : "Toca otra vez para escucharlo a velocidad normal";
}

/**
 * A small speaker next to English text: a tap says it with the device's English voice at the
 * learner's speed, the next tap on the same speaker says it at the other speed (slow, after a
 * normal one), and so on. While it speaks, the speaker is filled with ink (no animation, so
 * reduced motion needs nothing). Hidden when pronunciation is off, the device has no English
 * voice, or there is nothing to say. 44 pt, labelled "Escuchar: <text>". No press click: the
 * speech is the feedback.
 */
export function SpeakButton({ text, label, style }: SpeakButtonProps) {
  const { available, speak, speakingKey, rate } = usePronunciation();
  const key = useId();
  const presses = useRef(0);
  const styles = useStyles();
  const { colors } = useTheme();
  const trimmed = text.trim();
  if (!available || trimmed === "") return null;
  const speaking = speakingKey === key;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label ?? `Escuchar: ${trimmed}`}
      accessibilityHint={hintFor(rate)}
      accessibilityState={{ busy: speaking }}
      pressSound={false}
      hitSlop={4}
      onPress={() => {
        // Every other tap on this speaker plays at the other speed.
        const at = presses.current % 2 === 0 ? rate : other(rate);
        // Called inside the tap: iOS speaks only from a user gesture.
        speak(trimmed, key, at);
        presses.current += 1;
      }}
      wrapperStyle={[styles.wrapper, style]}
      style={({ pressed }) => [
        styles.button,
        speaking && styles.speaking,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.icon} pointerEvents="none">
        <SpeakerGlyph color={speaking ? colors.onInk : colors.ink} />
      </View>
    </PressableScale>
  );
}

/** A pen-drawn speaker with two sound waves (decorative). */
function SpeakerGlyph({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path
        d="M15.5 9.2a4 4 0 0 1 0 5.6M18 6.8a7.5 7.5 0 0 1 0 10.4"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    wrapper: { alignSelf: "flex-start" },
    button: {
      width: TOUCH_TARGET,
      height: TOUCH_TARGET,
      borderRadius: TOUCH_TARGET / 2,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: colors.rule,
      backgroundColor: colors.sheet,
    },
    speaking: { backgroundColor: colors.ink, borderColor: colors.ink },
    pressed: { borderColor: colors.ink },
    icon: { width: 22, height: 22 },
  }),
);
