import type { Level } from "@english-learn/domain";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ChoiceRow } from "@/shared/ui/choice-row";
import { PressableScale } from "@/shared/ui/pressable-scale";
import { Text } from "@/shared/ui/text";
import { radius, spacing } from "@/shared/ui/theme";
import { themedStyles } from "@/shared/ui/use-theme";

/** A level the path can show, with how many of its lessons are done. */
export type HomePathLevel = {
  readonly level: Level;
  readonly done: number;
  readonly total: number;
};

function percent({ done, total }: HomePathLevel): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/**
 * The path's level as a chip under its heading: it says whether the level follows the automatic
 * one or was picked by hand, and opens a short list of radios ("Automático" and every level with
 * its progress) right under it. Picking one closes it; nothing moves but the press feedback.
 */
export function PathLevelPicker({
  level,
  autoLevel,
  chosen,
  levels,
  onChoose,
}: {
  level: Level;
  autoLevel: Level;
  chosen: boolean;
  levels: readonly HomePathLevel[];
  onChoose: (level: Level | null) => void;
}) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const pick = (next: Level | null) => {
    setOpen(false);
    onChoose(next);
  };
  return (
    <View style={styles.picker}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`Nivel del recorrido: ${level}, ${chosen ? "elegido a mano" : "automático"}`}
        accessibilityHint="Muestra los niveles para elegir cuál ver"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((was) => !was)}
        wrapperStyle={styles.chipWrapper}
        style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
      >
        <Text variant="smallStrong" tone="ink">
          {`Nivel ${level} · ${chosen ? "elegido" : "automático"}`}
        </Text>
        <Text variant="smallStrong" tone="ink" importantForAccessibility="no">
          {open ? "▴" : "▾"}
        </Text>
      </PressableScale>
      {open && (
        <View accessibilityRole="radiogroup" accessibilityLabel="Nivel del recorrido">
          <View style={styles.options}>
            <ChoiceRow
              label={`Automático, ahora ${autoLevel}`}
              content={`Automático · ahora ${autoLevel}`}
              checked={!chosen}
              disabled={false}
              onPress={() => pick(null)}
            />
            {levels.map((entry) => (
              <ChoiceRow
                key={entry.level}
                label={`${entry.level}, ${percent(entry)} % completado`}
                content={`${entry.level} · ${percent(entry)} % completado`}
                checked={chosen && entry.level === level}
                disabled={false}
                onPress={() => pick(entry.level)}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    picker: { gap: spacing.sm },
    chipWrapper: { alignSelf: "flex-start" },
    chip: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: colors.ink,
      backgroundColor: colors.sheet,
      boxShadow: `0 2px 0 ${colors.rule}`,
    },
    chipPressed: { backgroundColor: colors.rule },
    options: { gap: spacing.sm },
  }),
);
