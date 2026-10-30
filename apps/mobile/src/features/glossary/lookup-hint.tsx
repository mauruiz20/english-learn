import { Platform, StyleSheet, View } from "react-native";
import { Button } from "@/shared/ui/button";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import { useLookupHint } from "./glossary-provider";

const TAP_HINT = "Toca una palabra para ver su traducción";
const MOUSE_HINT = "Pasa el mouse o haz clic en una palabra para ver su traducción";

/** Web with a mouse gets the hover wording; touch screens (and native) the tap wording. */
function hintText(): string {
  if (Platform.OS !== "web" || typeof window === "undefined") return TAP_HINT;
  return window.matchMedia?.("(hover: hover) and (pointer: fine)").matches === true
    ? MOUSE_HINT
    : TAP_HINT;
}

/**
 * One-time hint above the first text with lookups: shown until the learner dismisses it
 * ("Entendido") or opens a lookup; remembered in the settings. Nothing outside a
 * `GlossaryProvider`.
 */
export function LookupHint() {
  const hint = useLookupHint();
  if (hint === null || !hint.visible) return null;
  return (
    <View style={styles.row}>
      <Text variant="small" tone="muted" style={styles.text}>
        {hintText()}
      </Text>
      <Button label="Entendido" variant="text" onPress={hint.dismiss} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.md,
    marginBottom: -spacing.sm,
  },
  text: { flexShrink: 1 },
});
