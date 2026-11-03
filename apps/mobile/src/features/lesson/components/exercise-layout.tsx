import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { GlossaryText } from "@/features/glossary/glossary-text";
import type { LookupLocks } from "@/features/glossary/model/lookup-runs";
import { Button } from "@/shared/ui/button";
import { RuledArea, ruledText } from "@/shared/ui/ruled-area";
import { Text } from "@/shared/ui/text";
import { fonts, radius, spacing } from "@/shared/ui/theme";
import { themedStyles } from "@/shared/ui/use-theme";

type ExerciseLayoutProps = {
  /** Spanish instruction, e.g. "Elige el significado". */
  instruction: string;
  children: ReactNode;
  canSubmit: boolean;
  /** Feedback is shown: the answer is locked and the submit button goes away. */
  locked: boolean;
  onSubmit: () => void;
  submitLabel?: string | undefined;
};

const CHECK_LABEL = "Comprobar";

/**
 * Instruction + exercise body + "Comprobar" button shared by every exercise type. "Comprobar" is
 * answered by the verdict sound, so it does not click; another submit (placement's "Siguiente",
 * which gives no feedback) does.
 */
export function ExerciseLayout({
  instruction,
  children,
  canSubmit,
  locked,
  onSubmit,
  submitLabel = CHECK_LABEL,
}: ExerciseLayoutProps) {
  return (
    <View style={styles.layout}>
      <Text accessibilityRole="header" variant="smallStrong" tone="muted">
        {instruction}
      </Text>
      {children}
      {!locked && (
        <Button
          label={submitLabel}
          disabled={!canSubmit}
          pressSound={submitLabel !== CHECK_LABEL}
          onPress={onSubmit}
        />
      )}
    </View>
  );
}

/** The prompt's card: a sheet of ruled paper lying on the page. */
const useCardStyle = themedStyles(({ colors }) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.sheet,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      boxShadow: `0 3px 0 ${colors.rule}`,
    },
  }),
);

/** The sentence to work on, written on ruled lines (the only ruled paper in the app). */
export function Prompt({
  text,
  hint,
  accessibilityLabel,
  lookup,
  children,
}: {
  text?: string;
  /** `text` is English: its words can be looked up (when `enabled`), except locked ones. */
  lookup?: (LookupLocks & { enabled: boolean }) | undefined;
  /** Spanish translation or help, under the lines. */
  hint?: string | undefined;
  accessibilityLabel?: string;
  /** Custom prompt content instead of `text` (e.g. a cloze with its blank). */
  children?: ReactNode;
}) {
  const cardStyle = useCardStyle();
  return (
    <View style={styles.prompt}>
      <View style={cardStyle.card}>
        <RuledArea>
          {children ??
            (lookup !== undefined && text !== undefined ? (
              <GlossaryText
                text={text}
                enabled={lookup.enabled}
                lockedRanges={lookup.lockedRanges}
                lockedEntryIds={lookup.lockedEntryIds}
                style={exerciseText.sentence}
              />
            ) : (
              <Text
                style={exerciseText.sentence}
                {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })}
              >
                {text}
              </Text>
            ))}
        </RuledArea>
      </View>
      {hint !== undefined && (
        <Text tone="muted" style={exerciseText.hint}>
          {hint}
        </Text>
      )}
    </View>
  );
}

export const exerciseText = StyleSheet.create({
  sentence: { fontFamily: fonts.bodyBold, fontSize: 22, ...ruledText },
  hint: { marginTop: spacing.xs },
});

const styles = StyleSheet.create({
  layout: { gap: spacing.lg },
  prompt: { gap: spacing.xs },
});
