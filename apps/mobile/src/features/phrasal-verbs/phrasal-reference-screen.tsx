import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/shared/ui/button";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import { phrasalReference } from "./model/phrasal-reference";

/** Offline reference only: consulting it never marks words learned or schedules reviews. */
export function PhrasalReferenceScreen({ content = corpus }: { content?: Corpus }) {
  const groups = useMemo(() => phrasalReference(content), [content]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = groups.find((group) => group.id === selectedId);
  return (
    <ScreenContainer key={selected?.id ?? "topics"} title="Referencia">
      <Text accessibilityRole="header" variant="title" tone="ink">
        Phrasal verbs
      </Text>
      {selected ? (
        <>
          <Button
            label="Ver todos los temas"
            variant="secondary"
            onPress={() => setSelectedId(null)}
          />
          <Text accessibilityRole="header" variant="title">
            {selected.title}
          </Text>
          {selected.entries.map((entry) => (
            <View key={entry.id} style={styles.entry}>
              <Text variant="smallStrong" tone="ink">
                {entry.verb}
              </Text>
              <Text>{entry.es}</Text>
              <Text>{entry.example.en}</Text>
              <Text tone="muted">{entry.example.es}</Text>
            </View>
          ))}
        </>
      ) : (
        <>
          <Text>Consulta las traducciones y los ejemplos del curso por tema, sin conexión.</Text>
          <Text tone="muted">{`${groups.reduce((total, group) => total + group.entries.length, 0)} entradas · ${groups.length} temas`}</Text>
          {groups.map((group) => (
            <Button
              key={group.id}
              label={group.title}
              variant="secondary"
              onPress={() => setSelectedId(group.id)}
            />
          ))}
          {groups.length === 0 && <Text>No hay phrasal verbs disponibles.</Text>}
        </>
      )}
    </ScreenContainer>
  );
}
const styles = StyleSheet.create({ entry: { gap: spacing.sm, paddingVertical: spacing.md } });
