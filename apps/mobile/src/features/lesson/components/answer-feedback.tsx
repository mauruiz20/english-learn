import { xpForAnswer, type Verdict, type WordDiffOp } from "@english-learn/domain";
import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { GlossaryRuns } from "@/features/glossary/glossary-text";
import { Button } from "@/shared/ui/button";
import { Highlight } from "@/shared/ui/highlight";
import { MarginNote } from "@/shared/ui/margin-note";
import { MOTION } from "@/shared/ui/motion";
import { PopBadge } from "@/shared/ui/pop-badge";
import { StrokeClip, usePenStroke } from "@/shared/ui/pen-stroke";
import { struckText } from "@/shared/ui/struck";
import { Text } from "@/shared/ui/text";
import { fonts, radius, spacing } from "@/shared/ui/theme";
import { useReducedMotion } from "@/shared/ui/use-reduced-motion";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";

type AnswerFeedbackProps = {
  verdict: Verdict;
  /** What the learner answered, as text. */
  given: string;
  correctAnswer: string;
  /** translate_write: word-level comparison of `given` with `correctAnswer`. */
  diff?: readonly WordDiffOp[] | undefined;
  /** translate_write: a common calque the answer shows, explained in Spanish. */
  hint?: string | undefined;
  /** The correct answer is English: its words can be looked up in the margin note. */
  lookupAnswer?: boolean | undefined;
  /** The learner marked this answer as correct (`verdict` is then "correct"). */
  disputed?: boolean | undefined;
  /** Offers "Mi respuesta también es correcta" (translate_write answers graded wrong or almost). */
  onDispute?: (() => void) | undefined;
  /** Right answers in a row so far, this one included (cheered from three). */
  inARow?: number | undefined;
  /** The study card that explains the exercise: "Ver ficha: …" after a wrong or almost answer. */
  card?: { readonly title: string; readonly onOpen: () => void } | undefined;
  /** "Continuar" finishes the session: the completion sound plays, not the press click. */
  finishes?: boolean | undefined;
  onContinue: () => void;
};

/** From how many right answers in a row the band cheers them. */
const CHEER_FROM = 3;

/** The band's headline: what the teacher says first. */
function headline(verdict: Verdict, disputed: boolean): string {
  if (disputed) return DISPUTED_LABEL;
  return verdict === "correct" ? "¡Correcto!" : verdict === "almost" ? "¡Casi!" : "Incorrecto";
}

const DISPUTED_LABEL = "Marcada como correcta";

/** From how many differences the screen reader gets only the correct answer. */
const MAX_DESCRIBED = 3;

const bare = (text: string) => text.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");

/** One difference in plain words: "Sobra la palabra 'the'." */
function describeDifference(op: WordDiffOp): string {
  switch (op.kind) {
    case "same":
      return "";
    case "extra":
      return `Sobra la palabra '${bare(op.text)}'.`;
    case "missing":
      return op.expected.includes(" ")
        ? `Faltan las palabras '${op.expected}'.`
        : `Falta la palabra '${op.expected}'.`;
    case "changed":
      return `En lugar de '${bare(op.text)}', va '${op.expected}'.`;
  }
}

/** What a screen reader announces: plain words, since the marking is visual only. */
export function feedbackAnnouncement(
  verdict: Verdict,
  correctAnswer: string,
  disputed = false,
  diff?: readonly WordDiffOp[],
): string {
  if (disputed) return DISPUTED_LABEL;
  if (verdict === "correct") return "Correcto";
  const differences = diff !== undefined && linesUp(diff) ? diff.filter(isDifference) : [];
  const described =
    differences.length > 0 && differences.length <= MAX_DESCRIBED
      ? ` ${differences.map(describeDifference).join(" ")}`
      : "";
  return `${verdict === "almost" ? "Casi." : "Incorrecto."}${described} Respuesta correcta: ${correctAnswer}`;
}

const isDifference = (op: WordDiffOp) => op.kind !== "same";

/** Enough of the answer is right for marking only what is off to read well. */
function linesUp(diff: readonly WordDiffOp[]): boolean {
  const right = diff.filter((op) => op.kind === "same" && bare(op.text) !== "").length;
  return right > diff.filter(isDifference).length;
}

/** How the teacher marks the learner's answer: only the off words, or all of it struck. */
function markings(given: string, diff: readonly WordDiffOp[] | undefined): readonly WordDiffOp[] {
  return diff !== undefined && linesUp(diff) ? diff : [{ kind: "extra", text: given }];
}

/**
 * The teacher's marking of an answer, on a band tinted by the verdict, under a headline with a
 * round mark ("¡Correcto!", "¡Casi!", "Incorrecto"), the points it earned popping off as a
 * sticker and, from three right answers in a row, a cheer. Correct: the answer is swiped with the
 * yellow highlighter. Wrong or almost: with a word diff (translate_write) where enough lines up,
 * only what is off is marked in red pen (extra words struck; changed words struck with the right
 * one written next to them and missing words as a caret with the word, in the teacher's hand);
 * otherwise the whole answer is struck. Below, a margin note gives the right answer ("Era: …",
 * "Casi. Fíjate: …") and, when the answer shows a common calque, a hint explains it. Screen
 * readers get a plain sentence instead, naming up to three differences (`feedbackAnnouncement`).
 * A translate_write answer graded wrong or almost can be marked as correct by the learner
 * (`onDispute`): it is then highlighted with "Marcada como correcta". After a wrong or almost
 * answer, a quiet "Ver ficha: …" opens the study card that explains the exercise (`card`).
 */
export function AnswerFeedback({
  verdict,
  given,
  correctAnswer,
  diff,
  hint,
  lookupAnswer = false,
  disputed = false,
  onDispute,
  inARow = 0,
  card,
  finishes = false,
  onContinue,
}: AnswerFeedbackProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const band = colors.feedback[verdict];
  const points = xpForAnswer(verdict);
  const shown = given.length > 0 ? given : "(sin respuesta)";
  // The marking is visual only (screen readers get the alert). A note whose words can be looked
  // up stays reachable, though, so its lookup buttons are not hidden.
  const hideNote = !lookupAnswer;
  return (
    <View style={styles.panel}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.announcement}>
        {feedbackAnnouncement(verdict, correctAnswer, disputed, diff)}
      </Text>
      <View {...hidden} style={styles.headline}>
        <VerdictMark verdict={verdict} />
        <Text variant="heading" style={[styles.headlineText, { color: band.ink }]}>
          {headline(verdict, disputed)}
        </Text>
        {verdict === "correct" && inARow >= CHEER_FROM && (
          <View style={[styles.cheer, { borderColor: band.ink }]}>
            <Text variant="smallStrong" style={{ color: band.ink }}>
              {`¡${inARow} seguidas!`}
            </Text>
          </View>
        )}
        {points > 0 && <PopBadge label={`+${points}`} style={styles.badge} />}
      </View>
      <View style={styles.marking}>
        {verdict === "correct" ? (
          <View {...hidden} style={styles.marking}>
            <Highlight animate variant="title" style={styles.answer}>
              {shown}
            </Highlight>
          </View>
        ) : (
          <>
            <StruckAnswer marks={markings(shown, diff)} />
            <TeacherNote>
              <MarginNote {...(hideNote ? hidden : {})} style={styles.note}>
                {verdict === "almost" ? "Casi. Fíjate: " : "Era: "}
                <GlossaryRuns text={correctAnswer} enabled={lookupAnswer} />
              </MarginNote>
              {hint !== undefined && (
                <Text testID="feedback-hint" style={styles.hint}>
                  {hint}
                </Text>
              )}
            </TeacherNote>
          </>
        )}
      </View>
      <Button label="Continuar" pressSound={!finishes} onPress={onContinue} />
      {onDispute !== undefined && verdict !== "correct" && (
        <Button label="Mi respuesta también es correcta" variant="text" onPress={onDispute} />
      )}
      {card !== undefined && verdict !== "correct" && (
        <Button
          label={`Ver ficha: ${card.title}`}
          variant="text"
          accessibilityHint="Abre la ficha que lo explica; al volver, sigues donde estabas"
          onPress={card.onOpen}
        />
      )}
    </View>
  );
}

/** A round mark at the start of the band: a check, a tilde or a cross (decorative). */
function VerdictMark({ verdict }: { verdict: Verdict }) {
  const { colors } = useTheme();
  const band = colors.feedback[verdict];
  const fill =
    verdict === "correct"
      ? colors.highlighters.green
      : verdict === "almost"
        ? colors.highlighters.yellow
        : colors.highlighters.orange;
  const path =
    verdict === "correct"
      ? "M5 12.5 10 17 19 7"
      : verdict === "almost"
        ? "M5 13 C 8 8, 11 16, 14 11 S 18 9, 19 11"
        : "M7 7 17 17 M17 7 7 17";
  return (
    <View style={[markStyles.mark, { backgroundColor: fill, borderColor: band.tint }]}>
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path
          d={path}
          fill="none"
          stroke={colors.onHighlighter}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const markStyles = StyleSheet.create({
  mark: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});

/**
 * The learner's answer, marked in red pen: extra and changed words struck through, the right word
 * written after a changed one, and a caret with each missing word, in the teacher's hand. The
 * strike is drawn left to right over the answer (a pen stroke, ≈ 250 ms): a clipped copy of the
 * text that carries only the strike, revealed over the plain text, so it follows line wraps like
 * the highlighter does. Only the marked words carry a strike, so only they get drawn.
 */
function StruckAnswer({ marks }: { marks: readonly WordDiffOp[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const progress = usePenStroke(true);
  const words = (struck: boolean) =>
    marks.flatMap((mark, i) => {
      const space = i === 0 ? "" : " ";
      const handwriting = [styles.hand, struck ? styles.ink : { color: colors.redPen }];
      if (mark.kind === "missing") {
        return [
          <Text key={i} variant="title" style={[styles.answer, ...handwriting]}>
            {`${space}^${mark.expected}`}
          </Text>,
        ];
      }
      const off = mark.kind !== "same";
      const word = (
        <Text
          key={i}
          variant="title"
          tone={off ? "muted" : "text"}
          style={[styles.answer, struck && styles.ink, struck && off && styles.struck]}
        >
          {`${space}${mark.text}`}
        </Text>
      );
      if (mark.kind !== "changed") return [word];
      return [
        word,
        <Text key={`${i}-fix`} variant="title" style={[styles.answer, ...handwriting]}>
          {` ${mark.expected}`}
        </Text>,
      ];
    });
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
    headline: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
    headlineText: { flexShrink: 1 },
    cheer: {
      borderWidth: 2,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 1,
    },
    // The points sticker sits at the band's top right corner.
    badge: { position: "absolute", right: 0, top: -spacing.xs },
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
    // The teacher's corrections inside the answer: Caveat, a little larger to match its x-height.
    hand: { fontFamily: fonts.hand, fontSize: 27 },
    hint: { marginTop: spacing.xs, color: colors.text },
  }),
);
