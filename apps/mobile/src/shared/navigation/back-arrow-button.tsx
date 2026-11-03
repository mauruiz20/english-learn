import { Pressable, StyleSheet, View } from "react-native";
import { usePressSound } from "@/shared/ui/press-sound";
import { TOUCH_TARGET, spacing } from "@/shared/ui/theme";
import { themedStyles } from "@/shared/ui/use-theme";

type BackArrowButtonProps = { label: string; onPress: () => void };

/** The pen-drawn back arrow of the notebook header (a shaft and an open head). */
export function BackArrowButton({ label, onPress }: BackArrowButtonProps) {
  const styles = useStyles();
  const click = usePressSound();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        click();
        onPress();
      }}
      hitSlop={4}
      style={({ pressed }) => [styles.back, pressed && styles.pressed]}
    >
      <View style={styles.arrow}>
        <View style={styles.shaft} />
        <View style={styles.head} />
      </View>
    </Pressable>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    back: {
      width: TOUCH_TARGET,
      height: TOUCH_TARGET,
      // The arrow sits on the column edge, like the content below.
      marginLeft: -spacing.sm - 4,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: TOUCH_TARGET / 2,
    },
    pressed: { backgroundColor: colors.rule },
    arrow: { width: 20, height: 16, justifyContent: "center" },
    shaft: { height: 2.5, borderRadius: 1, backgroundColor: colors.ink },
    head: {
      position: "absolute",
      left: 1,
      width: 11,
      height: 11,
      borderLeftWidth: 2.5,
      borderBottomWidth: 2.5,
      borderColor: colors.ink,
      transform: [{ rotate: "45deg" }],
    },
  }),
);
