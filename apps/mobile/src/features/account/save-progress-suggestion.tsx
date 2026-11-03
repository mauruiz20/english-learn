import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAppServices } from "@/infrastructure/services/app-services";
import { Button } from "@/shared/ui/button";
import { StickyNote } from "@/shared/ui/sticky-note";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import { useAccount } from "./account-context";

/**
 * A one-time sticky note after the placement test: "save your progress" with an account. Only
 * where accounts work (web, the app's own site) and while signed out. It is remembered as shown
 * the first time it appears, so it never comes back, and "Ahora no" hides it right away.
 */
export function SaveProgressSuggestion() {
  const router = useRouter();
  const { settingsRepository } = useAppServices();
  const { availability, session } = useAccount();
  const eligible = availability === "available" && session.status === "signed-out";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!eligible) return;
    let active = true;
    settingsRepository
      .getSaveProgressSuggestionDismissed()
      .then(async (dismissed) => {
        if (dismissed || !active) return;
        setVisible(true);
        await settingsRepository.setSaveProgressSuggestionDismissed();
      })
      .catch((error: unknown) => console.error("Failed to read the suggestion state", error));
    return () => {
      active = false;
    };
  }, [eligible, settingsRepository]);

  if (!visible || !eligible) return null;
  return (
    <View style={styles.wrapper}>
      <StickyNote color="green">
        <Text variant="title">Guarda tu progreso</Text>
        <Text>
          Con una cuenta de Google, tu progreso se sincroniza y lo usas en otros dispositivos.
        </Text>
        <View style={styles.actions}>
          <Button label="Crear mi cuenta" onPress={() => router.push("/cuenta")} />
          <Button label="Ahora no" variant="text" onPress={() => setVisible(false)} />
        </View>
      </StickyNote>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { paddingHorizontal: spacing.xs },
  actions: { gap: spacing.xs, alignItems: "flex-start" },
});
