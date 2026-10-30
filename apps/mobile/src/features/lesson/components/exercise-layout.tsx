import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { GlossaryText } from "@/features/glossary/glossary-text";
import type { LookupLocks } from "@/features/glossary/model/lookup-runs";
import { Button } from "@/shared/ui/button";
import { RuledArea, ruledText } from "@/shared/ui/ruled-area";
import { Text } from "@/shared/ui/text";
import { fonts, spacing } from "@/shared/ui/theme";

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

/** Instruction + exercise body + "Comprobar" button shared by every exercise type. */
export function ExerciseLayout({
  instruction,
  children,
  canSubmit,
  locked,
  onSubmit,
  submitLabel = "Comprobar",
}: ExerciseLayoutProps) {
  return (
    <View style={styles.layout}>
      <Text accessibilityRole="header" variant="smallStrong" tone="muted">
        {instruction}
      </Text>
      {children}
      {!locked && <Button label={submitLabel} disabled={!canSubmit} onPress={onSubmit} />}
    </View>
  );
}

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
  return (
    <View style={styles.prompt}>
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
