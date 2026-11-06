import type { BucketCounts, DifficultyBucket } from "@english-learn/domain";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SpeakButton } from "@/features/pronunciation/speak-button";
import { Button } from "@/shared/ui/button";
import { Highlight } from "@/shared/ui/highlight";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { TOUCH_TARGET, radius, spacing, type HighlighterName } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import type { HardWord } from "./model/hard-words";

export type ProgressViewState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | {
      readonly status: "ready";
      readonly counts: BucketCounts;
      readonly hardWords: readonly HardWord[];
      /** Some exercise can practice the difficult words. */
      readonly canPractice: boolean;
    };

type ProgressViewProps = {
  state: ProgressViewState;
  onPractice: () => void;
  onOpenCard: (cardId: string) => void;
};

/** The buckets in reading order, with their name, the word for the bar's label and a color. */
const BUCKETS: readonly {
  readonly key: DifficultyBucket;
  readonly name: string;
  readonly word: string;
  readonly color: HighlighterName;
}[] = [
  { key: "mastered", name: "Dominadas", word: "dominadas", color: "green" },
  { key: "learning", name: "En proceso", word: "en proceso", color: "sky" },
  { key: "hard", name: "Difíciles", word: "difíciles", color: "orange" },
];

function words(n: number): string {
  return n === 1 ? "1 palabra" : `${n} palabras`;
}

/** "Olvidada 3 veces · 40 % de aciertos recientes". */
function hardWordMeta(word: HardWord): string {
  const parts: string[] = [];
  if (word.lapses > 0) parts.push(`Olvidada ${word.lapses} ${word.lapses === 1 ? "vez" : "veces"}`);
  if (word.recentAccuracy !== null) {
    parts.push(`${Math.round(word.recentAccuracy * 100)} % de aciertos recientes`);
  }
  return parts.join(" · ");
}

/**
 * "Tu progreso": how many reviewed words are mastered, in progress or difficult (one bar split
 * in three, with the counts written beside it, so color is never the only cue), the difficult
 * words with their meaning, a speaker and their study card, and the practice of them.
 */
export function ProgressView({ state, onPractice, onOpenCard }: ProgressViewProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <ScreenContainer title="Tu progreso">
      {state.status === "loading" && (
        <ActivityIndicator accessibilityLabel="Cargando tu progreso" color={colors.ink} />
      )}
      {state.status === "error" && (
        <Text accessibilityRole="alert" tone="redPen">
          No pudimos cargar tu progreso.
        </Text>
      )}
      {state.status === "ready" && (
        <ReadyProgress
          state={state}
          styles={styles}
          onPractice={onPractice}
          onOpenCard={onOpenCard}
        />
      )}
    </ScreenContainer>
  );
}

function ReadyProgress({
  state,
  styles,
  onPractice,
  onOpenCard,
}: {
  state: Extract<ProgressViewState, { status: "ready" }>;
  styles: ReturnType<typeof useStyles>;
  onPractice: () => void;
  onOpenCard: (cardId: string) => void;
}) {
  const { counts, hardWords } = state;
  const total = counts.mastered + counts.learning + counts.hard;
  if (total === 0) {
    return (
      <Text tone="muted">
        Todavía no hay palabras repasadas. Haz una lección y aquí verás cómo avanzas.
      </Text>
    );
  }
  return (
    <>
      <Text tone="muted">
        Las palabras que ya repasaste: cuáles dominas, cuáles estás aprendiendo y cuáles te cuestan.
      </Text>
      <BucketBar counts={counts} total={total} styles={styles} />
      <View style={styles.section}>
        <View style={styles.tab}>
          <Highlight accessibilityRole="header" variant="title" color="orange">
            Mis palabras difíciles
          </Highlight>
        </View>
        {hardWords.length === 0 ? (
          <Text tone="muted">No tienes palabras difíciles. ¡Sigue así!</Text>
        ) : (
          <>
            <Text tone="muted">
              Las que fallaste hace poco o te cuestan más. Practícalas y vuelven a tus repasos.
            </Text>
            {state.canPractice && (
              <Button label="Practicar mis palabras difíciles" onPress={onPractice} />
            )}
            <View>
              {hardWords.map((word) => (
                <HardWordRow
                  key={word.itemId}
                  word={word}
                  styles={styles}
                  onOpenCard={onOpenCard}
                />
              ))}
            </View>
          </>
        )}
      </View>
    </>
  );
}

/**
 * One bar split in proportion to the three counts (a 2 pt paper gap between segments, an ink
 * outline so it stands out from the page in both themes), then a legend with each count in text.
 * Static: nothing animates, so reduced motion needs nothing.
 */
function BucketBar({
  counts,
  total,
  styles,
}: {
  counts: BucketCounts;
  total: number;
  styles: ReturnType<typeof useStyles>;
}) {
  const { colors } = useTheme();
  const label = `${words(total)}: ${BUCKETS.map((b) => `${counts[b.key]} ${b.word}`).join(", ")}`;
  return (
    <View style={styles.chart}>
      <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.bar}>
        {BUCKETS.filter((b) => counts[b.key] > 0).map((b) => (
          <View
            key={b.key}
            style={[
              styles.segment,
              { flex: counts[b.key], backgroundColor: colors.highlighters[b.color] },
            ]}
          />
        ))}
      </View>
      <View style={styles.legend}>
        {BUCKETS.map((b) => (
          <View key={b.key} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: colors.highlighters[b.color] }]} />
            <Text variant="small" tone="muted">
              {b.name}
            </Text>
            <Text testID={`bucket-count-${b.key}`} variant="heading">
              {String(counts[b.key])}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function HardWordRow({
  word,
  styles,
  onOpenCard,
}: {
  word: HardWord;
  styles: ReturnType<typeof useStyles>;
  onOpenCard: (cardId: string) => void;
}) {
  const meta = hardWordMeta(word);
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text variant="bodyStrong">{word.term}</Text>
        <Text tone="muted">{word.es}</Text>
        {meta !== "" && (
          <Text variant="small" tone="muted">
            {meta}
          </Text>
        )}
        {word.card !== undefined && <CardLink card={word.card} onOpenCard={onOpenCard} />}
      </View>
      <SpeakButton text={word.speakText} label={`Escuchar: ${word.term}`} />
    </View>
  );
}

function CardLink({
  card,
  onOpenCard,
}: {
  card: { readonly id: string; readonly title: string };
  onOpenCard: (cardId: string) => void;
}) {
  return (
    <Button variant="text" label={`Ver ficha: ${card.title}`} onPress={() => onOpenCard(card.id)} />
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    chart: { gap: spacing.sm },
    bar: {
      height: 20,
      flexDirection: "row",
      gap: 2,
      padding: 2,
      borderRadius: radius.sm,
      borderWidth: 1.5,
      borderColor: colors.ink,
      backgroundColor: colors.sheet,
      overflow: "hidden",
    },
    segment: { borderRadius: 2 },
    legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
    legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    swatch: {
      width: 14,
      height: 14,
      borderRadius: 3,
      borderWidth: 1.5,
      borderColor: colors.ink,
    },
    section: { gap: spacing.sm, marginTop: spacing.md },
    tab: { alignSelf: "flex-start" },
    row: {
      minHeight: TOUCH_TARGET + spacing.md,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
    rowText: { flex: 1, gap: 2, alignItems: "flex-start" },
  }),
);
