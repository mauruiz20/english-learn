import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import { themedStyles } from "@/shared/ui/use-theme";
import { phrasalReference } from "./model/phrasal-reference";

/** Offline reference only: consulting it never marks words learned or schedules reviews. */
export function PhrasalReferenceScreen({ content = corpus }: { content?: Corpus }) {
  const groups = useMemo(() => phrasalReference(content), [content]);
  const styles = useStyles();
  return (
    <ScreenContainer title="Referencia">
      <Text accessibilityRole="header" variant="title" tone="ink">
        Phrasal verbs
      </Text>
      <Text>Consulta todos los phrasal verbs del curso en una sola lista, separados por tema.</Text>
      <Text tone="muted">{`${groups.reduce((total, group) => total + group.entries.length, 0)} entradas · ${groups.length} temas`}</Text>
      {groups.map((group) => (
        <View key={group.id} style={styles.topic}>
          <Text accessibilityRole="header" variant="title" tone="ink">
            {group.title}
          </Text>
          {group.entries.map((entry) => (
            <View key={entry.id} style={styles.entry}>
              <Text variant="smallStrong" tone="ink">
                {entry.verb}
              </Text>
              <Text>{entry.es}</Text>
              <Text>{entry.example.en}</Text>
              <Text tone="muted">{entry.example.es}</Text>
            </View>
          ))}
        </View>
      ))}
      {groups.length === 0 && <Text>No hay phrasal verbs disponibles.</Text>}
    </ScreenContainer>
  );
}
const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    topic: {
      borderTopWidth: 1,
      borderTopColor: colors.ink,
      paddingTop: spacing.lg,
      gap: spacing.md,
    },
    entry: { gap: spacing.sm, paddingVertical: spacing.md },
  }),
);
