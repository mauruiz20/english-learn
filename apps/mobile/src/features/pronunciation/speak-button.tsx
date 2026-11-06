import { useId } from "react";
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

/**
 * A small speaker next to English text: every tap says it with the device's English voice at the
 * learner's speed ("Velocidad de la voz"). No hidden speed toggle: a second tap that played at
 * the other speed made "Lenta" sound faster on the next tap; the listening exercises have an
 * explicit "Más lento" button instead. While it speaks, the speaker is filled with ink (no
 * animation, so reduced motion needs nothing). Hidden when pronunciation is off, the device has
 * no English voice, or there is nothing to say. 44 pt, labelled "Escuchar: <text>". No press
 * click: the speech is the feedback.
 */
export function SpeakButton({ text, label, style }: SpeakButtonProps) {
  const { available, speak, speakingKey } = usePronunciation();
  const key = useId();
  const styles = useStyles();
  const { colors } = useTheme();
  const trimmed = text.trim();
  if (!available || trimmed === "") return null;
  const speaking = speakingKey === key;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label ?? `Escuchar: ${trimmed}`}
      accessibilityState={{ busy: speaking }}
      pressSound={false}
      hitSlop={4}
      // Called inside the tap: iOS speaks only from a user gesture.
      onPress={() => speak(trimmed, key)}
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
export function SpeakerGlyph({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
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
