import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAppServices } from "@/infrastructure/services/app-services";
import { Button } from "@/shared/ui/button";
import { Avi } from "@/shared/ui/mascot";
import { StickyNote } from "@/shared/ui/sticky-note";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import { PLUMAS_COLOR } from "./feather";
import { plumasWelcome, welcomeText } from "./model/plumas-copy";

/**
 * The note's paper, the plumas color. Sticky notes are always light paper: the dark text passes
 * AA on it, and "Entendido" is a paper key (ink on white), since ink text on a highlighter does
 * not.
 */
export const PLUMAS_NOTE_COLOR = PLUMAS_COLOR;

/**
 * The one-time note on home for the plumas a baseline granted (lessons done before the event
 * log): "Avi te guardó 135 plumas por lo que ya estudiaste." `welcome` is that grant
 * (`earnedBySource.welcome`), or `null` while there is nothing to decide on: the progress is
 * loading, or the store has no events yet (a new device before its first sync pull). The first
 * decision is stored (see `plumasWelcome`); "Entendido" dismisses the note for good, and a read
 * that was already under way when it was pressed cannot bring it back.
 */
export function PlumasWelcomeNote({ welcome }: { welcome: number | null }) {
  const { settingsRepository } = useAppServices();
  const [shown, setShown] = useState<number | null>(null);
  const dismissed = useRef(false);

  useEffect(() => {
    if (welcome === null) return;
    let active = true;
    settingsRepository
      .getPlumasWelcome()
      .then(async (stored) => {
        const { show, store } = plumasWelcome(stored, welcome);
        if (store !== null) await settingsRepository.setPlumasWelcome(store);
        if (active && !dismissed.current) setShown(show);
      })
      .catch((error: unknown) => console.error("Failed to read the plumas note", error));
    return () => {
      active = false;
    };
  }, [welcome, settingsRepository]);

  if (shown === null) return null;
  const dismiss = () => {
    const plumas = shown;
    dismissed.current = true;
    setShown(null);
    settingsRepository
      .setPlumasWelcome({ plumas, dismissed: true })
      .catch((error: unknown) => console.error("Failed to dismiss the plumas note", error));
  };
  return (
    <View testID="plumas-welcome" style={styles.wrapper}>
      <StickyNote color={PLUMAS_NOTE_COLOR}>
        <View style={styles.row}>
          <Avi mood="happy" size={44} />
          <Text variant="bodyStrong" style={styles.text}>
            {welcomeText(shown)}
          </Text>
        </View>
        <View style={styles.actions}>
          <Button label="Entendido" variant="secondary" onPress={dismiss} />
        </View>
      </StickyNote>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { paddingHorizontal: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  text: { flexShrink: 1 },
  actions: { alignItems: "flex-start" },
});
