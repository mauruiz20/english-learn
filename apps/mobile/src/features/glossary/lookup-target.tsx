import { StyleSheet, Text } from "react-native";
import { themedStyles } from "@/shared/ui/use-theme";
import { useGlossary } from "./glossary-provider";
import {
  LOOKUP_HINT_A11Y,
  lookupLabel,
  underlineColor,
  type LookupTargetProps,
} from "./lookup-labels";

/**
 * A word or phrase that opens its lookup card when tapped (native: a nested `Text`, so the
 * sentence keeps wrapping and reading as one paragraph). Marked with a dotted underline in the
 * muted ink (iOS draws it dotted and muted; Android only draws a solid underline in the text
 * color).
 */
export function LookupTarget({ text, entryId }: LookupTargetProps) {
  const styles = useStyles();
  const glossary = useGlossary();
  return (
    <Text
      accessibilityRole="button"
      accessibilityLabel={lookupLabel(text)}
      accessibilityHint={LOOKUP_HINT_A11Y}
      suppressHighlighting={false}
      onPress={() => glossary?.open(entryId, null, "dialog")}
      style={styles.target}
    >
      {text}
    </Text>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    target: {
      textDecorationLine: "underline",
      textDecorationStyle: "dotted",
      textDecorationColor: underlineColor(colors.textMuted),
    },
  }),
);
