import type { GlossaryEntry } from "@english-learn/domain";
import { StyleSheet, View } from "react-native";
import { Text } from "@/shared/ui/text";
import { fonts, spacing, type HighlighterName } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { SpeakButton } from "@/features/pronunciation/speak-button";
import { speakableTerm } from "@/features/pronunciation/model/speakable-text";
import { lookupCardContent } from "./model/lookup-card-content";

/** Width of the card where there is room (web popover). */
export const LOOKUP_CARD_MAX_WIDTH = 300;

/**
 * The learner's own dictionary card, written in ink on a slip of paper tucked into the margin
 * (not the teacher's red pen): headword, part of speech, then 1–3 Spanish senses. A thin tab in
 * the topic's highlighter on the left edge when there is a topic. A card that can be pressed (a
 * dialog, not a hover tooltip) offers to hear the headword (`speakable`).
 */
export function LookupCard({
  entry,
  tint,
  footer,
  speakable = false,
}: {
  entry: GlossaryEntry;
  tint?: HighlighterName | undefined;
  footer?: React.ReactNode;
  /** Shows the speaker next to the headword (when pronunciation is available). */
  speakable?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { headword, partOfSpeech, senses } = lookupCardContent(entry);
  const numbered = senses.length > 1;
  return (
    <View style={styles.card}>
      {tint !== undefined && (
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.tab, { backgroundColor: colors.highlighters[tint] }]}
        />
      )}
      <View style={styles.headRow}>
        <View style={styles.head}>
          <Text style={styles.headword}>{headword}</Text>
          {partOfSpeech !== null && (
            <Text variant="small" tone="muted">
              {partOfSpeech}
            </Text>
          )}
        </View>
        {speakable && <SpeakButton text={speakableTerm(headword)} />}
      </View>
      <View style={styles.senses}>
        {senses.map((sense, i) => (
          <View key={i} style={styles.sense}>
            {numbered && (
              <Text tone="muted" style={styles.number}>
                {`${i + 1}.`}
              </Text>
            )}
            <Text style={styles.es}>{sense.es}</Text>
            {sense.partOfSpeech !== null && (
              <Text variant="small" tone="muted">
                {sense.partOfSpeech}
              </Text>
            )}
          </View>
        ))}
      </View>
      {footer}
    </View>
  );
}

const useStyles = themedStyles(({ colors, scheme }) =>
  StyleSheet.create({
    card: {
      gap: spacing.xs + 2,
      paddingVertical: spacing.md - 4,
      paddingLeft: spacing.md + 2,
      paddingRight: spacing.md,
      backgroundColor: colors.sheet,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: colors.rule,
      borderRadius: 2,
      // A slip of paper lifted off the page: a hard offset shadow, like the word-order strips.
      boxShadow: `3px 3px 0 ${scheme === "dark" ? "#08101F" : colors.rule}`,
      overflow: "hidden",
    },
    tab: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
    headRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    head: {
      flex: 1,
      flexDirection: "row",
      alignItems: "baseline",
      flexWrap: "wrap",
      columnGap: spacing.sm,
    },
    headword: { fontFamily: fonts.heading, fontSize: 21, lineHeight: 26, color: colors.ink },
    senses: { gap: 2 },
    sense: {
      flexDirection: "row",
      alignItems: "baseline",
      flexWrap: "wrap",
      columnGap: spacing.sm,
    },
    number: { fontFamily: fonts.body, fontSize: 15, minWidth: 14 },
    es: { fontFamily: fonts.body, fontSize: 17, lineHeight: 24, flexShrink: 1 },
  }),
);
