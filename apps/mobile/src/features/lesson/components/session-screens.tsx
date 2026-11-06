import { LESSON_BONUS_THRESHOLD, type Verdict } from "@english-learn/domain";
import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { GlossaryText } from "@/features/glossary/glossary-text";
import { lookupEnabled } from "@/features/lesson/model/lookup-policy";
import { speakableTerm } from "@/features/pronunciation/model/speakable-text";
import { WithSpeaker } from "@/features/pronunciation/with-speaker";
import { topicHighlighter } from "@/features/topics/topic-colors";
import { topicLabel } from "@/features/topics/topic-labels";
import { Button } from "@/shared/ui/button";
import { ClipChainMark } from "@/shared/ui/clip-chain";
import { Confetti } from "@/shared/ui/confetti";
import { formatDays } from "@/shared/ui/format";
import { Highlight } from "@/shared/ui/highlight";
import { MarginNote } from "@/shared/ui/margin-note";
import { Avi } from "@/shared/ui/mascot";
import { PerfectStamp } from "@/shared/ui/perfect-stamp";
import { RollingNumber } from "@/shared/ui/rolling-number";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Sticker } from "@/shared/ui/sticker";
import { Text } from "@/shared/ui/text";
import { SLAP_SPRING } from "@/shared/ui/motion";
import { radius, spacing, type HighlighterName } from "@/shared/ui/theme";
import { useCountUp } from "@/shared/ui/use-count-up";
import { useReducedMotion } from "@/shared/ui/use-reduced-motion";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { STREAK_SOUND_DELAY_MS } from "../use-session-sounds";
import type { ReviewNote } from "../model/items-to-review";
import type { RecapItem } from "../model/lesson-recap";

/**
 * Where the learner is in a lesson or review: one step per exercise, each answered step colored
 * by how it went (mint right, yellow almost, coral wrong), the current one outlined in ink, with
 * "Ejercicio 2 de 6" (and the lesson title) under it. With a `topic`, the label is marked with its
 * highlighter; the label is the title, or the topic's name when there is no title (review). A
 * step pops once when its answer is checked (not with reduced motion).
 */
export function SessionProgress({
  position,
  total,
  title,
  topic,
  results = [],
}: {
  position: number;
  total: number;
  title?: string;
  topic?: string | undefined;
  /** Verdicts of the exercises answered so far, in order (the shown answer included). */
  results?: readonly Verdict[] | undefined;
}) {
  const styles = useStyles();
  const tint = topic === undefined ? undefined : topicHighlighter(topic);
  const label = title ?? (topic === undefined ? undefined : topicLabel(topic));
  return (
    <View style={styles.progress}>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Progreso"
        accessibilityValue={{ min: 0, max: total, now: position - 1 }}
        style={styles.steps}
      >
        {Array.from({ length: total }, (_, i) => (
          <ProgressStep key={i} kind={results[i] ?? (i === position - 1 ? "current" : "todo")} />
        ))}
      </View>
      <View style={styles.progressRow}>
        {label !== undefined &&
          (tint === undefined ? (
            <Text variant="smallStrong" tone="ink" style={styles.progressTitle}>
              {label}
            </Text>
          ) : (
            <View style={styles.progressTitle}>
              <Highlight variant="smallStrong" color={tint}>
                {label}
              </Highlight>
            </View>
          ))}
        <Text variant="small" tone="muted">{`Ejercicio ${position} de ${total}`}</Text>
      </View>
    </View>
  );
}

type StepKind = Verdict | "current" | "todo";

function ProgressStep({ kind }: { kind: StepKind }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const answered = kind !== "current" && kind !== "todo";
  useEffect(() => {
    if (!answered || reduced) return;
    scale.set(withSequence(withTiming(1.35, { duration: 110 }), withSpring(1, SLAP_SPRING)));
  }, [answered, reduced, scale]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));
  const fill: Record<StepKind, object> = {
    correct: { backgroundColor: colors.highlighters.green },
    almost: { backgroundColor: colors.highlighters.yellow },
    wrong: { backgroundColor: colors.highlighters.orange },
    current: { backgroundColor: colors.sheet, borderWidth: 2, borderColor: colors.ink },
    todo: { backgroundColor: colors.rule },
  };
  return <Animated.View testID={`step-${kind}`} style={[styles.step, fill[kind], pop]} />;
}

type SummaryProps = {
  title: string;
  correct: number;
  total: number;
  xpEarned: number;
  streakDays: number;
  /** This session extended the streak (the number rolls to its new value, with the sound). */
  streakIncreased?: boolean;
  /** Items missed in the session (wrong or almost), at most a handful. */
  toReview: readonly ReviewNote[];
  /** The lesson's topic: its color is the sticker's (a review gets a sky sticker). */
  topic?: string | undefined;
  /** Album stickers this session earned. */
  achievements?: readonly EarnedSticker[] | undefined;
  /** The button at the end ("Volver al inicio" by default). */
  doneLabel?: string | undefined;
  onGoHome: () => void;
  /** "Lo nuevo de hoy": the lesson's new items (lessons only). */
  recap?: readonly RecapItem[] | undefined;
  /** Opens a recap item's study card; without it, cards are not linked. */
  onOpenCard?: ((cardId: string) => void) | undefined;
  /** "Repetir lección": runs the lesson again (lessons only). */
  onRedo?: (() => void) | undefined;
  /** What comes next, above the done button (a review: "Te quedan 25 para otro repaso."). */
  next?: string | undefined;
};

/** An album sticker as the summary announces it. */
export type EarnedSticker = {
  readonly id: string;
  readonly title: string;
  readonly color: HighlighterName;
  readonly rare?: boolean | undefined;
};

/** The teacher's word for the session, from how many answers were right. */
export function summaryCheer(correct: number, total: number): string {
  const ratio = total === 0 ? 0 : correct / total;
  if (ratio === 1) return "¡Perfecto!";
  if (ratio >= LESSON_BONUS_THRESHOLD) return "¡Muy bien!";
  if (ratio >= 0.5) return "¡Bien hecho!";
  return "¡A seguir practicando!";
}

// A broad marker check for the big sticker.
const BIG_CHECK = "M6 25 C 10 28, 14 32, 18 38 C 24 26, 32 16, 44 8";

/**
 * The graded page, as a celebration: the session's sticker is slapped onto the page with Avi
 * cheering and hole-punch confetti falling (none with reduced motion), the teacher's word for it
 * in red pen (on a perfect page, her "¡Excelente!" stamp instead) and her score in the corner;
 * then the results card (the XP counts up, a grown streak rolls to its new number and hooks a new
 * clip onto the chain, with the streak sound), the stickers earned for the album, and the words
 * to look at again.
 */
export function SessionSummary({
  title,
  correct,
  total,
  xpEarned,
  streakDays,
  streakIncreased = false,
  toReview,
  topic,
  achievements = [],
  doneLabel = "Volver al inicio",
  onGoHome,
  recap = [],
  onOpenCard,
  onRedo,
  next,
}: SummaryProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const perfect = total > 0 && correct === total;
  const xp = useCountUp(xpEarned);
  return (
    <ScreenContainer
      title={title}
      aside={
        <MarginNote
          variant="grade"
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.grade}
        >
          {`${correct}/${total}`}
        </MarginNote>
      }
    >
      <View style={styles.hero}>
        <Sticker
          testID="summary-sticker"
          color={topic === undefined ? "sky" : topicHighlighter(topic)}
          size={116}
          tilt={-7}
          slap
          delayMs={150}
        >
          <Svg width={50} height={44} viewBox="0 0 50 44">
            <Path
              d={BIG_CHECK}
              fill="none"
              stroke={colors.onHighlighter}
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Sticker>
        <View style={styles.heroSide}>
          <Avi testID="avi-cheer" mood="cheer" fly delayMs={450} size={64} />
          {perfect ? (
            <PerfectStamp />
          ) : (
            <MarginNote style={styles.cheer}>{summaryCheer(correct, total)}</MarginNote>
          )}
        </View>
      </View>
      <View style={styles.results}>
        <ResultRow mark={<MiniSticker color="green" glyph="check" />}>
          <Text variant="title">{`Aciertos: ${correct} de ${total}`}</Text>
        </ResultRow>
        <ResultRow mark={<MiniSticker color="yellow" glyph="star" />}>
          <Text variant="title" accessibilityLabel={`XP ganada: ${xpEarned}`}>
            {`XP ganada: ${xp}`}
          </Text>
        </ResultRow>
        <ResultRow
          last
          mark={
            <View style={styles.chain}>
              <ClipChainMark
                days={streakDays}
                grow={streakIncreased}
                delayMs={STREAK_SOUND_DELAY_MS}
              />
            </View>
          }
        >
          <StreakLine days={streakDays} increased={streakIncreased} />
        </ResultRow>
      </View>
      {achievements.map((a, i) => (
        <EarnedCard key={a.id} sticker={a} index={i} />
      ))}
      <View testID="summary-to-review" style={styles.review}>
        <Text accessibilityRole="header" variant="title" tone="ink">
          Para repasar
        </Text>
        {toReview.length === 0 ? (
          <Text tone="muted" style={styles.allRight}>
            Nada que corregir: todo correcto a la primera. Estas palabras volverán en tus próximos
            repasos.
          </Text>
        ) : (
          <View>
            {toReview.map((note) => (
              <View key={note.id} style={[styles.line, styles.note]}>
                {note.topic !== undefined && <TopicTab topic={note.topic} />}
                <GlossaryText
                  variant="bodyStrong"
                  text={note.term}
                  enabled={lookupEnabled("summary.terms", true)}
                />
                <Text tone="muted">{note.es}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      {recap.length > 0 && <Recap items={recap} onOpenCard={onOpenCard} />}
      {next !== undefined && <Text variant="bodyStrong">{next}</Text>}
      <Button label={doneLabel} onPress={onGoHome} />
      {onRedo !== undefined && (
        <Button
          label="Repetir lección"
          variant={perfect ? "text" : "secondary"}
          accessibilityHint={
            perfect ? "Vuelve a hacer la lección" : "Vuelve a hacer la lección para sacar todo bien"
          }
          onPress={onRedo}
        />
      )}
      <Confetti delayMs={250} />
    </ScreenContainer>
  );
}

/**
 * "Lo nuevo de hoy": the words, phrases and structures the lesson introduced, one per ruled line:
 * the term and its Spanish, then the study card that teaches it ("Ver ficha: …") or, without a
 * card, an example sentence with its translation.
 */
function Recap({
  items,
  onOpenCard,
}: {
  items: readonly RecapItem[];
  onOpenCard: ((cardId: string) => void) | undefined;
}) {
  const styles = useStyles();
  return (
    <View testID="summary-recap" style={styles.review}>
      <Text accessibilityRole="header" variant="title" tone="ink">
        Lo nuevo de hoy
      </Text>
      <Text variant="small" tone="muted">
        Vuelven en tus próximos repasos.
      </Text>
      <View>
        {items.map((item) => (
          <View key={item.id} style={[styles.line, styles.recapItem]}>
            <WithSpeaker text={speakableTerm(item.term)}>
              <View style={styles.note}>
                <GlossaryText
                  variant="bodyStrong"
                  text={item.term}
                  enabled={lookupEnabled("summary.terms", true)}
                />
                <Text tone="muted">{item.es}</Text>
              </View>
            </WithSpeaker>
            {item.card !== undefined && onOpenCard !== undefined ? (
              <Button
                label={`Ver ficha: ${item.card.title}`}
                variant="text"
                onPress={() => onOpenCard(item.card!.id)}
              />
            ) : (
              item.example !== undefined && (
                <WithSpeaker text={item.example.en}>
                  <View style={styles.example}>
                    <GlossaryText
                      text={item.example.en}
                      enabled={lookupEnabled("summary.terms", true)}
                    />
                    {item.example.es !== undefined && (
                      <Text variant="small" tone="muted">
                        {item.example.es}
                      </Text>
                    )}
                  </View>
                </WithSpeaker>
              )
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * "Nueva insignia para tu álbum": a dark card that rises in after the results (staggered when
 * there are several), with the sticker slapped on it.
 */
function EarnedCard({ sticker, index }: { sticker: EarnedSticker; index: number }) {
  const styles = useStyles();
  const reduced = useReducedMotion();
  const shown = useSharedValue(reduced ? 1 : 0);
  const delay = 900 + index * 250;
  useEffect(() => {
    shown.set(reduced ? 1 : withDelay(delay, withSpring(1, SLAP_SPRING)));
  }, [reduced, shown, delay]);
  const rise = useAnimatedStyle(() => ({
    opacity: Math.min(1, shown.value * 2),
    transform: [{ translateY: 24 * (1 - shown.value) }],
  }));
  return (
    <Animated.View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Nueva insignia para tu álbum: ${sticker.title}`}
      style={[styles.earned, rise]}
    >
      <Sticker
        color={sticker.color}
        size={52}
        tilt={-8}
        slap
        delayMs={delay + 120}
        style={sticker.rare === true ? styles.rare : undefined}
      >
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Path
            d="M12 3 14.6 9 21 9.6 16.2 13.8 17.6 20.2 12 16.9 6.4 20.2 7.8 13.8 3 9.6 9.4 9Z"
            fill="#1B2333"
          />
        </Svg>
      </Sticker>
      <View style={styles.earnedText}>
        <Text variant="small" style={styles.earnedLabel}>
          Nueva insignia para tu álbum
        </Text>
        <Text variant="bodyStrong" style={styles.earnedTitle}>
          {sticker.title}
        </Text>
      </View>
    </Animated.View>
  );
}

/** One result on the card: a small mark at the left, the result in words. */
function ResultRow({
  mark,
  last = false,
  testID,
  children,
}: {
  mark: ReactNode;
  last?: boolean;
  testID?: string;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View testID={testID} style={[styles.resultRow, !last && styles.resultDivider]}>
      <View
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.resultMark}
      >
        {mark}
      </View>
      <View style={styles.resultText}>{children}</View>
    </View>
  );
}

const GLYPHS = {
  check: "M5 12.5 10 17 19 7",
  star: "M12 3 14.6 9 21 9.6 16.2 13.8 17.6 20.2 12 16.9 6.4 20.2 7.8 13.8 3 9.6 9.4 9Z",
} as const;

/** A small round sticker with a check or a star, beside a result. */
function MiniSticker({ color, glyph }: { color: HighlighterName; glyph: keyof typeof GLYPHS }) {
  const { colors } = useTheme();
  return (
    <Sticker color={color} size={34} tilt={glyph === "check" ? -5 : 8}>
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <Path
          d={GLYPHS[glyph]}
          fill={glyph === "star" ? colors.onHighlighter : "none"}
          stroke={colors.onHighlighter}
          strokeWidth={glyph === "star" ? 1.5 : 3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Sticker>
  );
}

/**
 * "Racha: 3 días"; when the session grew it, "2 días" rolls up to "3 días" (each line with its
 * own plural). A streak that starts today has no old value worth showing ("0 días"), so it
 * appears at "1 día".
 */
function StreakLine({ days, increased }: { days: number; increased: boolean }) {
  const styles = useStyles();
  const reduced = useReducedMotion();
  const label = `Racha: ${formatDays(days)}`;
  if (!increased || reduced || days < 2) {
    return <Text variant="title">{label}</Text>;
  }
  return (
    <View accessible accessibilityLabel={label} style={styles.streak}>
      <Text variant="title">{"Racha:\u00A0"}</Text>
      <RollingNumber
        from={days - 1}
        to={days}
        delayMs={STREAK_SOUND_DELAY_MS}
        format={formatDays}
      />
    </View>
  );
}

/** A small tab in the topic's highlighter, like a colored index sticker (decorative). */
function TopicTab({ topic }: { topic: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.tab, { backgroundColor: colors.highlighters[topicHighlighter(topic)] }]}
    />
  );
}

/** Waiting for the session to be saved. */
export function SavingScreen({ title, label }: { title: string; label: string }) {
  const { colors } = useTheme();
  return (
    <ScreenContainer title={title}>
      <ActivityIndicator accessibilityLabel={label} color={colors.ink} />
    </ScreenContainer>
  );
}

/** A problem message with "Reintentar" (when retrying makes sense) and a way home. */
export function SessionMessage({
  title,
  text,
  onRetry,
  onGoHome,
}: {
  title: string;
  text: string;
  onRetry?: () => void;
  onGoHome?: () => void;
}) {
  return (
    <ScreenContainer title={title}>
      <Text accessibilityRole="alert" tone="redPen">
        {text}
      </Text>
      {onRetry !== undefined && <Button label="Reintentar" onPress={onRetry} />}
      {onGoHome !== undefined && (
        <Button
          label="Volver al inicio"
          variant={onRetry === undefined ? "primary" : "secondary"}
          onPress={onGoHome}
        />
      )}
    </ScreenContainer>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    progress: { gap: spacing.sm },
    steps: { flexDirection: "row", gap: 4, height: 12, alignItems: "stretch" },
    step: { flex: 1, borderRadius: radius.pill },
    progressRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
    progressTitle: { flexShrink: 1 },
    tab: { width: 6, height: 16, borderRadius: 2, alignSelf: "center" },
    grade: { marginRight: spacing.xs, transform: [{ translateY: -6 }] },
    hero: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.lg,
      paddingVertical: spacing.sm,
      paddingLeft: spacing.sm,
    },
    heroSide: { flexShrink: 1, gap: spacing.xs, alignItems: "flex-start" },
    cheer: { fontSize: 32, lineHeight: 36, transform: [{ rotate: "-3deg" }] },
    results: {
      backgroundColor: colors.sheet,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      boxShadow: `0 3px 0 ${colors.rule}`,
    },
    resultRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      minHeight: 56,
      paddingVertical: spacing.sm,
    },
    resultDivider: { borderBottomWidth: 1, borderBottomColor: colors.rule },
    resultMark: { width: 44, alignItems: "center" },
    resultText: { flexShrink: 1 },
    // Always a dark card, in both schemes: the album's "new sticker" moment.
    earned: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: "#1B2333",
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.rule,
    },
    earnedText: { flexShrink: 1, gap: 2 },
    earnedLabel: { color: "#C9D3EA" },
    earnedTitle: { color: "#FFFFFF" },
    rare: { boxShadow: "0 0 0 3px #FF8FC7, 0 0 0 6px #5CC8FF" },
    chain: { transform: [{ scale: 0.9 }] },
    line: {
      paddingVertical: spacing.sm + 2,
      borderBottomWidth: 1,
      borderBottomColor: colors.rule,
    },
    review: { gap: spacing.xs },
    recapItem: { gap: spacing.xs },
    // The example hangs under its word, like a note indented on the ruled line.
    example: {
      gap: 2,
      paddingLeft: spacing.sm,
      borderLeftWidth: 2,
      borderLeftColor: colors.rule,
    },
    streak: { flexDirection: "row", alignItems: "center" },
    allRight: { paddingTop: spacing.xs },
    // "have breakfast   desayunar": the word and its meaning on one ruled line (wraps if long).
    note: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "baseline",
      columnGap: spacing.md,
    },
  }),
);
