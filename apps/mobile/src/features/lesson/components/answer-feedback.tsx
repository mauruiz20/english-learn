import type { Verdict } from "@english-learn/domain";
import { StyleSheet, View } from "react-native";
import { Button } from "@/shared/ui/button";
import { Highlight } from "@/shared/ui/highlight";
import { MarginNote } from "@/shared/ui/margin-note";
import { struckText } from "@/shared/ui/struck";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import { themedStyles } from "@/shared/ui/use-theme";
import { diffWords, type AnswerSegment } from "../model/answer-diff";

type AnswerFeedbackProps = {
  verdict: Verdict;
  /** What the learner answered, as text. */
  given: string;
  correctAnswer: string;
  onContinue: () => void;
};

/** What a screen reader announces: plain words, since the strike-through is visual only. */
export function feedbackAnnouncement(verdict: Verdict, correctAnswer: string): string {
  switch (verdict) {
    case "correct":
      return "Correcto";
    case "almost":
      return `Casi. Respuesta correcta: ${correctAnswer}`;
    case "wrong":
      return `Incorrecto. Respuesta correcta: ${correctAnswer}`;
  }
}

/** Which parts of the learner's answer the teacher strikes through. */
function struckSegments(verdict: Verdict, given: string, correctAnswer: string): AnswerSegment[] {
  if (verdict === "almost") {
    const segments = diffWords(given, correctAnswer);
    if (segments.some((s) => !s.differs)) return segments;
  }
  return [{ text: given, differs: true }];
}

/**
 * The teacher's marking of an answer. Correct: the answer is swiped with the yellow highlighter
 * and a short green "Correcto". Wrong: the answer is struck through in red pen with a margin
 * note giving the right one. Almost: only the words that are off are struck through (or the
 * whole answer if nothing lines up), with "Casi. Fíjate: …". Screen readers get a plain
 * sentence instead (`feedbackAnnouncement`).
 */
export function AnswerFeedback({ verdict, given, correctAnswer, onContinue }: AnswerFeedbackProps) {
  const styles = useStyles();
  const shown = given.length > 0 ? given : "(sin respuesta)";
  return (
    <View style={styles.panel}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.announcement}>
        {feedbackAnnouncement(verdict, correctAnswer)}
      </Text>
      <View
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.marking}
      >
        {verdict === "correct" ? (
          <>
            <Highlight animate variant="title" style={styles.answer}>
              {shown}
            </Highlight>
            <Text variant="title" tone="success">
              Correcto
            </Text>
          </>
        ) : (
          <>
            <Text variant="title" style={styles.answer}>
              {struckSegments(verdict, shown, correctAnswer).map((segment, i) => (
                <Text
                  key={i}
                  variant="title"
                  tone={segment.differs ? "muted" : "text"}
                  style={[styles.answer, segment.differs && styles.struck]}
                >
                  {i === 0 ? segment.text : ` ${segment.text}`}
                </Text>
              ))}
            </Text>
            <MarginNote style={styles.note}>
              {verdict === "almost" ? `Casi. Fíjate: ${correctAnswer}` : `Era: ${correctAnswer}`}
            </MarginNote>
          </>
        )}
      </View>
      <Button label="Continuar" onPress={onContinue} />
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    panel: { gap: spacing.md },
    // Read by screen readers, invisible on screen.
    announcement: {
      position: "absolute",
      width: 1,
      height: 1,
      overflow: "hidden",
      color: "transparent",
    },
    marking: { gap: spacing.xs },
    answer: { fontSize: 23, lineHeight: 31 },
    struck: struckText(colors),
    note: { fontSize: 29, lineHeight: 34 },
  }),
);
