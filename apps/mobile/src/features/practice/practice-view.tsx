import { ActivityIndicator, StyleSheet, View } from "react-native";
import { topicHighlighter } from "@/features/topics/topic-colors";
import { Highlight } from "@/shared/ui/highlight";
import { PressableScale } from "@/shared/ui/pressable-scale";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { radius, spacing } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { Chevron } from "./chevron";
import type { PracticeCollectionRow } from "./model/practice-catalog";

export type PracticeViewState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly collections: readonly PracticeCollectionRow[] };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "10 grupos · 30 lecciones · 2 hechas" (the done count only once something is done). */
export function practiceCount({
  groups,
  lessons,
  done,
}: Pick<PracticeCollectionRow, "groups" | "lessons" | "done">): string {
  const parts = [plural(groups, "grupo", "grupos"), plural(lessons, "lección", "lecciones")];
  if (done > 0) parts.push(plural(done, "hecha", "hechas"));
  return parts.join(" · ");
}

/**
 * `/practica`: the topics of free practice, apart from the path. Each opens its groups; nothing
 * is locked and none of it moves the path along.
 */
export function PracticeView({
  state,
  onOpenCollection,
}: {
  state: PracticeViewState;
  onOpenCollection: (slug: string) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <ScreenContainer title="Práctica libre">
      <Text tone="muted">
        Elige un tema y practícalo a fondo, a tu ritmo. Todo está abierto. Esta práctica no cambia
        tu camino de lecciones, y lo nuevo que aprendas vuelve en tus repasos.
      </Text>
      {state.status === "loading" && (
        <ActivityIndicator accessibilityLabel="Cargando la práctica libre" color={colors.ink} />
      )}
      {state.status === "error" && (
        <Text accessibilityRole="alert" tone="redPen">
          No pudimos cargar tu progreso.
        </Text>
      )}
      {state.status === "ready" &&
        state.collections.map((collection) => {
          const count = practiceCount(collection);
          return (
            <PressableScale
              key={collection.slug}
              accessibilityRole="button"
              accessibilityLabel={`${collection.title}: ${count.replaceAll(" · ", ", ")}`}
              onPress={() => onOpenCollection(collection.slug)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.rowText}>
                <View style={styles.tab}>
                  <Highlight variant="title" color={topicHighlighter(collection.slug)}>
                    {collection.title}
                  </Highlight>
                </View>
                <Text>{collection.summary}</Text>
                <Text variant="small" tone="muted">
                  {count}
                </Text>
              </View>
              <Chevron />
            </PressableScale>
          );
        })}
    </ScreenContainer>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    row: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.sheet,
      boxShadow: `0 3px 0 ${colors.rule}`,
    },
    pressed: { backgroundColor: colors.rule },
    rowText: { flex: 1, gap: spacing.xs },
    tab: { alignSelf: "flex-start" },
  }),
);
