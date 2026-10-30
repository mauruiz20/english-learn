import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useContext } from "react";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { Button } from "@/shared/ui/button";
import { MAX_TEXT_WIDTH, spacing, type HighlighterName } from "@/shared/ui/theme";
import type { OpenLookup } from "./glossary-provider";
import { LookupCard } from "./lookup-card";

type LookupPopoverProps = {
  lookup: OpenLookup | null;
  tint?: HighlighterName | undefined;
  onClose: () => void;
};

/**
 * Native lookup card: a bottom sheet-style card over a light scrim. Nested `Text` spans cannot
 * be measured on native, so anchoring the card to the word would be guesswork; the bottom of the
 * screen is always in reach of the thumb and never covers the sentence's start. A tap outside,
 * "Cerrar" or the Android back button closes it.
 */
export function LookupPopover({ lookup, tint, onClose }: LookupPopoverProps) {
  // Null outside a SafeAreaProvider (unit tests render components on their own).
  const bottomInset = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const visible = lookup !== null && lookup.mode === "dialog";
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        testID="lookup-backdrop"
        accessible={false}
        onPress={onClose}
        style={styles.backdrop}
      />
      {lookup !== null && (
        <View
          pointerEvents="box-none"
          style={[styles.sheet, { paddingBottom: Math.max(bottomInset, spacing.md) + spacing.sm }]}
        >
          <View
            accessibilityViewIsModal
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Traducción de ${lookup.entry.headword}`}
            style={styles.cardWrap}
          >
            <LookupCard
              entry={lookup.entry}
              tint={tint}
              footer={
                <View style={styles.close}>
                  <Button label="Cerrar" variant="text" onPress={onClose} />
                </View>
              }
            />
          </View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(4, 9, 20, 0.18)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    alignItems: "center",
  },
  cardWrap: { width: "100%", maxWidth: MAX_TEXT_WIDTH },
  close: { alignItems: "flex-end", marginTop: -spacing.xs, marginRight: -spacing.sm },
});
