import { StyleSheet } from "react-native";
import { PressableScale } from "@/shared/ui/pressable-scale";
import { Text } from "@/shared/ui/text";
import { TOUCH_TARGET, spacing } from "@/shared/ui/theme";

/** The small "Cuenta" link of the home page's top bar, next to the sound switch. */
export function AccountLink({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="link"
      accessibilityLabel="Cuenta"
      accessibilityHint="Guardá y sincronizá tu progreso"
      hitSlop={4}
      onPress={onPress}
      style={styles.link}
    >
      <Text variant="smallStrong" tone="ink" style={styles.label}>
        Cuenta
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: TOUCH_TARGET, justifyContent: "center", paddingHorizontal: spacing.xs },
  label: { textDecorationLine: "underline" },
});
