import { Pressable, StyleSheet, View } from "react-native";
import { TOUCH_TARGET } from "./theme";
import { themedStyles } from "./use-theme";

type SoundToggleButtonProps = {
  /** Sounds are on: the button mutes them. */
  enabled: boolean;
  onToggle: () => void;
};

/**
 * A pen-drawn speaker: with sound waves when sounds are on, crossed out when muted. Its label
 * says what pressing it does ("Silenciar sonidos" / "Activar sonidos").
 */
export function SoundToggleButton({ enabled, onToggle }: SoundToggleButtonProps) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={enabled ? "Silenciar sonidos" : "Activar sonidos"}
      onPress={onToggle}
      hitSlop={4}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <View style={styles.icon}>
        <View style={styles.body} />
        <View style={styles.cone} />
        {enabled ? (
          <>
            <View style={[styles.wave, styles.waveSmall]} />
            <View style={[styles.wave, styles.waveLarge]} />
          </>
        ) : (
          <View style={styles.cross}>
            <View style={[styles.crossStroke, styles.crossA]} />
            <View style={[styles.crossStroke, styles.crossB]} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

const STROKE = 2;

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
    icon: { width: 24, height: 20, flexDirection: "row", alignItems: "center" },
    body: {
      width: 5,
      height: 8,
      borderWidth: STROKE,
      borderRightWidth: 0,
      borderColor: colors.ink,
      borderTopLeftRadius: 1,
      borderBottomLeftRadius: 1,
    },
    // The cone: a trapezoid made of borders.
    cone: {
      width: 0,
      height: 8,
      borderRightWidth: 7,
      borderTopWidth: 6,
      borderBottomWidth: 6,
      borderRightColor: colors.ink,
      borderTopColor: "transparent",
      borderBottomColor: "transparent",
    },
    wave: {
      position: "absolute",
      borderColor: colors.ink,
      borderRightWidth: STROKE,
      borderTopWidth: 0,
      borderBottomWidth: 0,
      borderLeftWidth: 0,
    },
    waveSmall: { left: 9, top: 5, width: 7, height: 10, borderRadius: 5 },
    waveLarge: { left: 10, top: 1, width: 11, height: 18, borderRadius: 9 },
    cross: { position: "absolute", left: 15, top: 5, width: 9, height: 10 },
    crossStroke: {
      position: "absolute",
      left: 4,
      top: -1,
      width: STROKE,
      height: 12,
      borderRadius: 1,
      backgroundColor: colors.ink,
    },
    crossA: { transform: [{ rotate: "45deg" }] },
    crossB: { transform: [{ rotate: "-45deg" }] },
  }),
);
