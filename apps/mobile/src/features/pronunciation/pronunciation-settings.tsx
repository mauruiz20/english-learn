import type { SpeechRate } from "@english-learn/domain";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Button } from "@/shared/ui/button";
import { ChoiceRow } from "@/shared/ui/choice-row";
import { usePressSound } from "@/shared/ui/press-sound";
import { Text } from "@/shared/ui/text";
import { TOUCH_TARGET, radius, spacing } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { usePronunciation } from "./pronunciation";

const RATE_LABELS: Readonly<Record<SpeechRate, string>> = { normal: "Normal", slow: "Lenta" };

/**
 * The "Pronunciación" settings, next to the sound switch (home and the exercise headers): a
 * speech bubble that opens a small dialog with the on/off switch and the voice speed. Not shown
 * at all when the device cannot speak English.
 */
export function PronunciationSettingsButton() {
  const { supported, enabled, rate, setEnabled, setRate } = usePronunciation();
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
        onToggle={() => setEnabled(!enabled)}
        onPickRate={setRate}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

type DialogProps = {
  visible: boolean;
  enabled: boolean;
  rate: SpeechRate;
  onToggle: () => void;
  onPickRate: (rate: SpeechRate) => void;
  onClose: () => void;
};

/** The switch and the speed, in the app's in-app dialog style. */
export function PronunciationDialog({
  visible,
  enabled,
  rate,
  onToggle,
  onPickRate,
  onClose,
}: DialogProps) {
  const styles = useStyles();
  const click = usePressSound();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal accessibilityLabel="Pronunciación" style={styles.dialog}>
          <Text accessibilityRole="header" variant="heading">
            Pronunciación
          </Text>
          <Text>
            Toca el altavoz junto a una palabra o frase en inglés para escucharla con la voz de tu
            dispositivo. Toca otra vez para oírla a la otra velocidad.
          </Text>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Pronunciación"
            accessibilityState={{ checked: enabled }}
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
            style={styles.rates}
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
          <Button label="Listo" onPress={onClose} />
        </View>
      </View>
    </Modal>
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
    rates: { gap: spacing.sm },
  }),
);
