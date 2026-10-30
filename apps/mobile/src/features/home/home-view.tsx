import type { Level } from "@english-learn/domain";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button } from "@/shared/ui/button";
import { Screen } from "@/shared/ui/screen";
import { colors, radius, spacing } from "@/shared/ui/theme";

export type HomeViewState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | {
      readonly status: "ready";
      readonly streakDays: number;
      readonly xp: number;
      readonly level: Level | null;
    };

type HomeViewProps = {
  state: HomeViewState;
  onStartPlacement: () => void;
  onOpenReview: () => void;
  onOpenAbout: () => void;
};

function formatStreak(days: number): string {
  return `Racha: ${days} ${days === 1 ? "día" : "días"}`;
}

export function HomeView({ state, onStartPlacement, onOpenReview, onOpenAbout }: HomeViewProps) {
  return (
    <Screen title="Inicio">
      {state.status === "loading" && (
        <ActivityIndicator accessibilityLabel="Cargando tu progreso" color={colors.primary} />
      )}

      {state.status === "error" && (
        <Text accessibilityRole="alert" style={styles.error}>
          No pudimos cargar tu progreso.
        </Text>
      )}

      {state.status === "ready" && (
        <>
          <View style={styles.stats}>
            <View style={styles.card}>
              <Text style={styles.stat}>{formatStreak(state.streakDays)}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.stat}>{`XP: ${state.xp}`}</Text>
            </View>
          </View>

          <View style={styles.card}>
            {state.level === null ? (
              <>
                <Text style={styles.body}>Aún no conocemos tu nivel.</Text>
                <Button
                  label="Hacer test de nivel"
                  accessibilityHint="Abre un test corto para encontrar tu nivel de inglés"
                  onPress={onStartPlacement}
                />
              </>
            ) : (
              <Text style={styles.stat}>{`Tu nivel: ${state.level}`}</Text>
            )}
          </View>

          <Button label="Repasar" variant="secondary" onPress={onOpenReview} />
          <Button label="Acerca de" variant="secondary" onPress={onOpenAbout} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: spacing.md },
  card: {
    flexGrow: 1,
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stat: { fontSize: 18, fontWeight: "600", color: colors.text },
  body: { fontSize: 16, color: colors.textMuted },
  error: { fontSize: 16, color: colors.danger },
});
