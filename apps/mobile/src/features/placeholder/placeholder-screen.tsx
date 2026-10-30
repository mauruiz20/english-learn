import { StyleSheet, Text } from "react-native";
import { Screen } from "@/shared/ui/screen";
import { colors } from "@/shared/ui/theme";

/** Temporary screen for features that are not built yet. */
export function PlaceholderScreen({ title }: { title: string }) {
  return (
    <Screen title={title}>
      <Text style={styles.body}>Próximamente</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 16, color: colors.textMuted },
});
