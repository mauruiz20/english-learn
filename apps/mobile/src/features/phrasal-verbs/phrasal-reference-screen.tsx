import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { useMemo, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Button } from "@/shared/ui/button";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { fonts, spacing } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { phrasalReference } from "./model/phrasal-reference";

/** Offline reference only: consulting it never marks words learned or schedules reviews. */
export function PhrasalReferenceScreen({ content = corpus }: { content?: Corpus }) {
  const groups = useMemo(() => phrasalReference(content), [content]);
  const [query, setQuery] = useState("");
  const { colors } = useTheme();
  const visibleGroups = useMemo(() => {
    const term = normalizeSearch(query);
    if (!term) return groups;
    return groups.flatMap((group) => {
      const entries = group.entries.filter((entry) =>
        [entry.verb, entry.verb.replace(/\([^)]*\)/g, " "), entry.es].some((text) =>
          normalizeSearch(text).includes(term),
        ),
      );
      return entries.length ? [{ ...group, entries }] : [];
    });
  }, [groups, query]);
  const entryCount = visibleGroups.reduce((total, group) => total + group.entries.length, 0);
  const styles = useStyles();
  return (
    <ScreenContainer title="Referencia">
      <Text accessibilityRole="header" variant="title" tone="ink">
        Phrasal verbs
      </Text>
      <Text>Consulta todos los phrasal verbs del curso en una sola lista, separados por tema.</Text>
      <Text variant="smallStrong">Buscar</Text>
      <TextInput
        accessibilityLabel="Buscar phrasal verbs"
        placeholder="Ej.: give up o rendirse"
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        returnKeyType="search"
        style={styles.input}
      />
      {query.length > 0 && (
        <Button label="Limpiar búsqueda" variant="text" onPress={() => setQuery("")} />
      )}
      <Text tone="muted">{`${entryCount} ${entryCount === 1 ? "entrada" : "entradas"} · ${visibleGroups.length} ${visibleGroups.length === 1 ? "tema" : "temas"}`}</Text>
      {visibleGroups.map((group) => (
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
      {groups.length > 0 && visibleGroups.length === 0 && (
        <Text>No encontramos phrasal verbs con esa búsqueda.</Text>
      )}
    </ScreenContainer>
  );
}
const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    input: {
      minHeight: 48,
      padding: spacing.md,
      fontFamily: fonts.body,
      fontSize: 18,
      color: colors.ink,
      borderWidth: 1,
      borderColor: colors.ink,
      borderRadius: 8,
    },
    topic: {
      borderTopWidth: 1,
      borderTopColor: colors.ink,
      paddingTop: spacing.lg,
      gap: spacing.md,
    },
    entry: { gap: spacing.sm, paddingVertical: spacing.md },
  }),
);

function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("es")
    .replace(/\s+/g, " ")
    .trim();
}
