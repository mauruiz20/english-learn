import type { SpeechRate } from "@english-learn/domain";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { SpeechVoice } from "@/infrastructure/speech/speech-service";
import { Button } from "@/shared/ui/button";
import { ChoiceRow } from "@/shared/ui/choice-row";
import { usePressSound } from "@/shared/ui/press-sound";
import { Text } from "@/shared/ui/text";
import { TOUCH_TARGET, radius, spacing } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { usePronunciation } from "./pronunciation";
import { SpeakerGlyph } from "./speak-button";

const RATE_LABELS: Readonly<Record<SpeechRate, string>> = { normal: "Normal", slow: "Lenta" };

/** What "Probar" says with a voice. */
export const VOICE_SAMPLE = "Hello! This is how I sound. Have a nice day.";

/** Where an English voice is from, as a learner reads it. */
const REGIONS: Readonly<Record<string, string>> = {
  "en-us": "EE. UU.",
  "en-gb": "Reino Unido",
  "en-au": "Australia",
  "en-ie": "Irlanda",
  "en-in": "India",
  "en-za": "Sudáfrica",
  "en-ca": "Canadá",
  "en-nz": "Nueva Zelanda",
  "en-sc": "Escocia",
};

/** "Daniel, Reino Unido" (the region is left out when the name already says it). */
export function voiceLabel(voice: SpeechVoice): string {
  const region = REGIONS[voice.lang.toLowerCase()] ?? voice.lang;
  return voice.name.includes("(") || voice.name.includes(" - ")
    ? voice.name
    : `${voice.name}, ${region}`;
}

/**
 * The "Pronunciación" settings, next to the sound switch (home and the exercise headers): a
 * speech bubble that opens a small dialog with the on/off switch, the voice speed and the voice.
 * Not shown at all when the device cannot speak English.
 */
export function PronunciationSettingsButton() {
  const {
    supported,
    enabled,
    rate,
    setEnabled,
    setRate,
    voices,
    voice,
    setVoice,
    speak,
    speakingKey,
  } = usePronunciation();
  const [open, setOpen] = useState(false);
  const styles = useStyles();
  const { colors } = useTheme();
  const click = usePressSound();
  if (!supported) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pronunciación"
        accessibilityValue={{
          text: enabled ? `activada, velocidad ${RATE_LABELS[rate].toLowerCase()}` : "desactivada",
        }}
        accessibilityHint="Abre las opciones de pronunciación"
        hitSlop={4}
        onPress={() => {
          click();
          setOpen(true);
        }}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <BubbleGlyph color={colors.ink} crossed={!enabled} />
      </Pressable>
      <PronunciationDialog
        visible={open}
        enabled={enabled}
        rate={rate}
        voices={voices}
        voice={voice}
        tryingVoice={
          speakingKey?.startsWith(TRY_KEY) === true ? speakingKey.slice(TRY_KEY.length) : null
        }
        onToggle={() => setEnabled(!enabled)}
        onPickRate={setRate}
        onPickVoice={setVoice}
        // Called inside the tap: iOS speaks only from a user gesture.
        onTryVoice={(id) => speak(VOICE_SAMPLE, `${TRY_KEY}${id}`, { voice: id })}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const TRY_KEY = "try-voice:";

type DialogProps = {
  visible: boolean;
  enabled: boolean;
  rate: SpeechRate;
  voices: readonly SpeechVoice[];
  /** The learner's pick, or null for "Automática". */
  voice: string | null;
  /** The voice "Probar" is playing, or null. */
  tryingVoice: string | null;
  onToggle: () => void;
  onPickRate: (rate: SpeechRate) => void;
  onPickVoice: (voice: string | null) => void;
  onTryVoice: (voice: string) => void;
  onClose: () => void;
};

/** The switch, the speed and the voice, in the app's in-app dialog style. */
export function PronunciationDialog({
  visible,
  enabled,
  rate,
  voices,
  voice,
  tryingVoice,
  onToggle,
  onPickRate,
  onPickVoice,
  onTryVoice,
  onClose,
}: DialogProps) {
  const styles = useStyles();
  const click = usePressSound();
  // A pick that is not on this device (voices differ) shows as "Automática".
  const picked = voices.some((v) => v.id === voice) ? voice : null;
  // What "Automática" speaks with: the best voice of the device.
  const automatic = voices[0];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal accessibilityLabel="Pronunciación" style={styles.dialog}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text accessibilityRole="header" variant="heading">
              Pronunciación
            </Text>
            <Text>
              Toca el altavoz junto a una palabra o frase en inglés para escucharla con la voz de tu
              dispositivo, a la velocidad que elijas aquí.
            </Text>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Pronunciación"
              accessibilityState={{ checked: enabled }}
              // react-native-web drops `checked` for a switch: the web reads it from here.
              aria-checked={enabled}
              onPress={() => {
                onToggle();
                click();
              }}
              style={styles.switchRow}
            >
              <Text variant="bodyStrong" style={styles.switchText}>
                {enabled ? "Activada" : "Desactivada"}
              </Text>
              <SwitchTrack on={enabled} />
            </Pressable>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Velocidad de la voz"
              style={styles.group}
            >
              <Text variant="smallStrong" tone="muted">
                Velocidad de la voz
              </Text>
              {(["normal", "slow"] as const).map((option) => (
                <ChoiceRow
                  key={option}
                  label={RATE_LABELS[option]}
                  checked={rate === option}
                  disabled={!enabled}
                  onPress={() => onPickRate(option)}
                />
              ))}
            </View>
            {voices.length > 0 && (
              <View accessibilityRole="radiogroup" accessibilityLabel="Voz" style={styles.group}>
                <Text variant="smallStrong" tone="muted">
                  Voz
                </Text>
                <Text variant="small" tone="muted">
                  Si la voz suena mal, prueba otra. Puedes descargar voces mejores (mejorada o
                  premium) en los ajustes de accesibilidad de tu dispositivo.
                </Text>
                <ChoiceRow
                  label={automatic === undefined ? "Automática" : `Automática (${automatic.name})`}
                  checked={picked === null}
                  disabled={!enabled}
                  onPress={() => onPickVoice(null)}
                />
                {voices.map((option) => (
                  <View key={option.id} style={styles.voiceRow}>
                    <View style={styles.voiceChoice}>
                      <ChoiceRow
                        label={voiceLabel(option)}
                        checked={picked === option.id}
                        disabled={!enabled}
                        onPress={() => onPickVoice(option.id)}
                      />
                    </View>
                    <TryButton
                      name={option.name}
                      trying={tryingVoice === option.id}
                      disabled={!enabled}
                      onPress={() => onTryVoice(option.id)}
                    />
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
          <Button label="Listo" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

/** "Probar": says a short sample with one voice; filled with ink while it speaks. */
function TryButton({
  name,
  trying,
  disabled,
  onPress,
}: {
  name: string;
  trying: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Probar la voz ${name}`}
      accessibilityState={{ busy: trying, disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tryButton,
        (trying || pressed) && styles.tryActive,
        disabled && styles.tryDisabled,
      ]}
    >
      <SpeakerGlyph color={trying ? colors.onInk : colors.ink} size={18} />
      <Text variant="smallStrong" style={{ color: trying ? colors.onInk : colors.ink }}>
        Probar
      </Text>
    </Pressable>
  );
}

/** An ink switch: the knob sits right and the track fills when on. Decorative (the row speaks). */
function SwitchTrack({ on }: { on: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.track, on && styles.trackOn]}>
      <View style={[styles.knob, on ? styles.knobOn : styles.knobOff]} />
    </View>
  );
}

/** A speech bubble with "Aa"-like strokes; struck through when pronunciation is off. */
function BubbleGlyph({ color, crossed }: { color: string; crossed: boolean }) {
  return (
    <Svg width={26} height={24} viewBox="0 0 26 24">
      <Path
        d="M4 4h18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path
        d="M7 14l3-7 3 7M8.2 11.5h3.6M15.5 10.5a2 2 0 1 1 0 3.5M19 9.5v4.5"
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {crossed && <Path d="M3 22 23 2" stroke={color} strokeWidth={2.2} strokeLinecap="round" />}
    </Svg>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    button: {
      width: TOUCH_TARGET,
      height: TOUCH_TARGET,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: TOUCH_TARGET / 2,
    },
    pressed: { backgroundColor: colors.rule },
    backdrop: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.md,
      backgroundColor: colors.scrim,
    },
    dialog: {
      width: "100%",
      maxWidth: 420,
      // Many voices scroll inside the dialog; "Listo" stays in view.
      maxHeight: "90%",
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: colors.sheet,
      borderWidth: 1,
      borderColor: colors.rule,
    },
    switchRow: {
      minHeight: TOUCH_TARGET + 4,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingVertical: spacing.xs,
    },
    switchText: { flexShrink: 1 },
    track: {
      width: 52,
      height: 30,
      borderRadius: 15,
      borderWidth: 2,
      borderColor: colors.ink,
      backgroundColor: colors.sheet,
      justifyContent: "center",
    },
    trackOn: { backgroundColor: colors.ink },
    knob: { width: 20, height: 20, borderRadius: 10, position: "absolute" },
    knobOn: { right: 3, backgroundColor: colors.onInk },
    knobOff: { left: 3, backgroundColor: colors.ink },
    content: { gap: spacing.md },
    group: { gap: spacing.sm },
    voiceRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    voiceChoice: { flex: 1 },
    tryButton: {
      minHeight: TOUCH_TARGET,
      minWidth: TOUCH_TARGET,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: colors.ink,
      backgroundColor: colors.sheet,
    },
    tryActive: { backgroundColor: colors.ink },
    tryDisabled: { opacity: 0.5 },
  }),
);
