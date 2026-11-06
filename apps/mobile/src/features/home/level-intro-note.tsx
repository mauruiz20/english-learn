import type { Level } from "@english-learn/domain";
import { StyleSheet, View } from "react-native";
import { Button } from "@/shared/ui/button";
import { Text } from "@/shared/ui/text";
import { radius, spacing } from "@/shared/ui/theme";
import { themedStyles } from "@/shared/ui/use-theme";

/** A level's intro as the path shows it (`level.json`), open or closed. */
export type HomeLevelIntro = {
  readonly level: Level;
  readonly title: string;
  /** "Al terminar este nivel podrás…" */
  readonly canDo: readonly string[];
  readonly topics: readonly string[];
  /** Shown above the level's first lesson (the first time, or reopened). */
  readonly open: boolean;
};

/**
 * The level's intro above its first lesson: what the learner will be able to do at the end and
 * its topics. Dismissible ("Entendido"); nothing animates.
 */
export function LevelIntroNote({
  intro,
  onDismiss,
}: {
  intro: HomeLevelIntro;
  onDismiss: () => void;
}) {
  const styles = useStyles();
  return (
    <View testID="level-intro" style={styles.note}>
      <Text variant="bodyStrong" accessibilityRole="header">
        {intro.title}
      </Text>
      <Text variant="smallStrong" tone="ink">
        Al terminar este nivel podrás…
      </Text>
      <View style={styles.list}>
        {intro.canDo.map((line) => (
          <View key={line} style={styles.item}>
            <Text tone="ink" importantForAccessibility="no" aria-hidden>
              ✓
            </Text>
            <Text style={styles.itemText}>{line}</Text>
          </View>
        ))}
      </View>
      <Text variant="small" tone="muted">{`Temas: ${intro.topics.join(", ")}.`}</Text>
      <View style={styles.actions}>
        <Button label="Entendido" variant="secondary" onPress={onDismiss} />
      </View>
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    note: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: colors.ink,
      backgroundColor: colors.sheet,
    },
    list: { gap: spacing.xs },
    item: { flexDirection: "row", gap: spacing.sm },
    itemText: { flex: 1 },
    actions: { alignItems: "flex-start" },
  }),
);
