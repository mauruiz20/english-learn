import type { Level } from "@english-learn/domain";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/shared/ui/button";
import { formatDays } from "@/shared/ui/format";
import { Screen } from "@/shared/ui/screen";
import { colors, radius, spacing } from "@/shared/ui/theme";

export type HomeLesson = { readonly id: string; readonly title: string; readonly done: boolean };

export type HomeLessons = { readonly level: Level; readonly items: readonly HomeLesson[] };

export type HomeViewState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | {
      readonly status: "ready";
      readonly streakDays: number;
      readonly xp: number;
      readonly level: Level | null;
      /** Lessons of the learner's level (or the default level). */
      readonly lessons: HomeLessons;
    };

type HomeViewProps = {
  state: HomeViewState;
  onOpenLesson: (lessonId: string) => void;
  onStartPlacement: () => void;
  onOpenReview: () => void;
  onOpenAbout: () => void;
};

function LessonRow({ lesson, onPress }: { lesson: HomeLesson; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={lesson.done ? `${lesson.title}, completada` : lesson.title}
      onPress={onPress}
      style={({ pressed }) => [styles.lesson, pressed && styles.pressed]}
    >
      <Text style={styles.lessonTitle}>{lesson.title}</Text>
      {lesson.done && <Text style={styles.done}>Completada</Text>}
    </Pressable>
  );
}

export function HomeView({
  state,
  onOpenLesson,
  onStartPlacement,
  onOpenReview,
  onOpenAbout,
}: HomeViewProps) {
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
              <Text style={styles.stat}>{`Racha: ${formatDays(state.streakDays)}`}</Text>
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

          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.heading}>
              {`Lecciones de nivel ${state.lessons.level}`}
            </Text>
            {state.lessons.items.length === 0 ? (
              <Text style={styles.body}>Todavía no hay lecciones para este nivel.</Text>
            ) : (
              state.lessons.items.map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  onPress={() => onOpenLesson(lesson.id)}
                />
              ))
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
  section: { gap: spacing.sm },
  heading: { fontSize: 20, fontWeight: "700", color: colors.text },
  lesson: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.8 },
  lessonTitle: { flexShrink: 1, fontSize: 17, fontWeight: "600", color: colors.text },
  done: { fontSize: 15, fontWeight: "600", color: colors.success },
});
