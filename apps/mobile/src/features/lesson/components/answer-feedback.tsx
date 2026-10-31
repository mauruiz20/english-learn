import type { Verdict } from "@english-learn/domain";
import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { GlossaryRuns } from "@/features/glossary/glossary-text";
import { Button } from "@/shared/ui/button";
import { Highlight } from "@/shared/ui/highlight";
import { MarginNote } from "@/shared/ui/margin-note";
import { MOTION } from "@/shared/ui/motion";
import { StrokeClip, usePenStroke } from "@/shared/ui/pen-stroke";
import { struckText } from "@/shared/ui/struck";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import { useReducedMotion } from "@/shared/ui/use-reduced-motion";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { diffWords, type AnswerSegment } from "../model/answer-diff";

type AnswerFeedbackProps = {
  verdict: Verdict;
  /** What the learner answered, as text. */
  given: string;
  correctAnswer: string;
  /** The correct answer is English: its words can be looked up in the margin note. */
  lookupAnswer?: boolean | undefined;
  /** The learner marked this answer as correct (`verdict` is then "correct"). */
  disputed?: boolean | undefined;
  /** Offers "Mi respuesta también es correcta" (translate_write answers graded wrong or almost). */
  onDispute?: (() => void) | undefined;
  onContinue: () => void;
};

const DISPUTED_LABEL = "Marcada como correcta";

/** What a screen reader announces: plain words, since the strike-through is visual only. */
export function feedbackAnnouncement(
  verdict: Verdict,
  correctAnswer: string,
  disputed = false,
): string {
  if (disputed) return DISPUTED_LABEL;
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
 * sentence instead (`feedbackAnnouncement`). A translate_write answer graded wrong or almost
 * can be marked as correct by the learner (`onDispute`): it is then highlighted with
 * "Marcada como correcta".
 */
export function AnswerFeedback({
  verdict,
  given,
  correctAnswer,
  lookupAnswer = false,
  disputed = false,
  onDispute,
  onContinue,
}: AnswerFeedbackProps) {
  const styles = useStyles();
  const shown = given.length > 0 ? given : "(sin respuesta)";
  // The marking is visual only (screen readers get the alert). A note whose words can be looked
  // up stays reachable, though, so its lookup buttons are not hidden.
  const hideNote = !lookupAnswer;
  return (
    <View style={styles.panel}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.announcement}>
        {feedbackAnnouncement(verdict, correctAnswer, disputed)}
      </Text>
      <View style={styles.marking}>
        {verdict === "correct" ? (
          <View {...hidden} style={styles.marking}>
            <Highlight animate variant="title" style={styles.answer}>
              {shown}
            </Highlight>
            <Text variant="title" tone="success">
              {disputed ? DISPUTED_LABEL : "Correcto"}
            </Text>
          </View>
        ) : (
          <>
            <StruckAnswer segments={struckSegments(verdict, shown, correctAnswer)} />
            <TeacherNote>
              <MarginNote {...(hideNote ? hidden : {})} style={styles.note}>
                {verdict === "almost" ? "Casi. Fíjate: " : "Era: "}
                <GlossaryRuns text={correctAnswer} enabled={lookupAnswer} />
              </MarginNote>
            </TeacherNote>
          </>
        )}
      </View>
      <Button label="Continuar" onPress={onContinue} />
      {onDispute !== undefined && verdict !== "correct" && (
        <Button label="Mi respuesta también es correcta" variant="text" onPress={onDispute} />
      )}
    </View>
  );
}

/**
 * The learner's answer with the off words struck through in red pen. The strike is drawn left to
 * right over the answer (a pen stroke, ≈ 250 ms): a clipped copy of the text that carries only the
 * strike, revealed over the plain text, so it follows line wraps like the highlighter does.
 */
function StruckAnswer({ segments }: { segments: readonly AnswerSegment[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const progress = usePenStroke(true);
  const words = (struck: boolean) =>
    segments.map((segment, i) => (
      <Text
        key={i}
        variant="title"
        tone={segment.differs ? "muted" : "text"}
        style={[styles.answer, struck && styles.ink, struck && segment.differs && styles.struck]}
      >
        {i === 0 ? segment.text : ` ${segment.text}`}
      </Text>
    ));
  // A pixel of slack so the copy never wraps earlier than the text it marks.
  const copyWidth = width + 2;
  return (
    <View
      {...hidden}
      testID="struck-answer"
      style={styles.struckWrap}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Text variant="title" style={styles.answer}>
        {words(false)}
      </Text>
      {width > 0 && (
        <StrokeClip progress={progress} width={copyWidth}>
          <Text variant="title" style={[styles.answer, { width: copyWidth, color: colors.redPen }]}>
            {words(true)}
          </Text>
        </StrokeClip>
      )}
    </View>
  );
}

/** The teacher's note comes once the strike is drawn: a quick fade and settle (≈ 150 ms). */
function TeacherNote({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const shown = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    shown.value = reduced ? 1 : withDelay(MOTION.stroke, withTiming(1, { duration: MOTION.note }));
  }, [reduced, shown]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ scale: 0.94 + 0.06 * shown.value }],
  }));
  return (
    <Animated.View testID="margin-note" style={[noteOrigin, style]}>
      {children}
    </Animated.View>
  );
}

const noteOrigin = { transformOrigin: "left center" } as const;

const hidden = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

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
    // The copy carries only the strike: its letters are transparent (Android, where the line
    // follows the text color, keeps the struck words in red pen, as before).
    ink: { color: "transparent" },
    struckWrap: { alignSelf: "flex-start", maxWidth: "100%" },
    note: { fontSize: 29, lineHeight: 34 },
  }),
);
