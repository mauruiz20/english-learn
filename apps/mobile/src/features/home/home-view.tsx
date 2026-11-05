import type { Level } from "@english-learn/domain";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import { Button } from "@/shared/ui/button";
import { formatDays } from "@/shared/ui/format";
import { ClipChainMark } from "@/shared/ui/clip-chain";
import { HandCheck } from "@/shared/ui/hand-check";
import { Highlight } from "@/shared/ui/highlight";
import { SoundToggleButton } from "@/shared/ui/sound-toggle-button";
import { ThemeToggleButton } from "@/shared/ui/theme-toggle-button";
import type { ThemePreference } from "@/shared/ui/theme-preference";
import { AccountLink } from "@/features/account/account-link";
import { PressableScale } from "@/shared/ui/pressable-scale";
import { ProgressLine } from "@/shared/ui/progress-line";
import { Avi } from "@/shared/ui/mascot";
import { guideHeading } from "./model/guide-heading";
import { HomeGreeting, type HomeGreetingAvi } from "./home-greeting";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Sticker } from "@/shared/ui/sticker";
import { StickyNote } from "@/shared/ui/sticky-note";
import { Text } from "@/shared/ui/text";
import { radius, spacing, type HighlighterName } from "@/shared/ui/theme";
import { XpBar } from "@/shared/ui/xp-bar";
import { PlumasBalance } from "@/features/rewards/plumas-balance";
import { PathLevelPicker, type HomePathLevel } from "./path-level-picker";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { topicHighlighter } from "@/features/topics/topic-colors";
import { topicLabel } from "@/features/topics/topic-labels";
import { cardsCount } from "@/features/cards/cards-view";
import { PerfectBadge } from "@/features/lesson/components/perfect-badge";
import {
  scoreDescription,
  scoreText,
  type LessonScore,
} from "@/features/lesson/model/lesson-score";

/** A study card that goes deeper into a lesson ("Profundiza"), with its best practice result. */
export type HomeDeepenCard = {
  readonly id: string;
  readonly title: string;
  /** Its best practice result; none if never practiced ("Nueva"). */
  readonly score?: LessonScore | undefined;
};

export type HomeLesson = {
  readonly id: string;
  readonly title: string;
  /** Topic slug (e.g. "daily-routine"); the index groups lessons by it. */
  readonly topic: string;
  readonly done: boolean;
  /** Completed since the index was last seen: its check is drawn now, once. */
  readonly justCompleted?: boolean;
  /** Its best result, when the log has one (lessons done before the event log have none). */
  readonly score?: LessonScore | undefined;
  /** The cards linked to the lesson, shown under it once it is done. */
  readonly deepen?: readonly HomeDeepenCard[] | undefined;
};

export type HomeLessons = {
  readonly level: Level;
  readonly items: readonly HomeLesson[];
  /** The level the path follows on its own (shown as "Automático" in the level picker). */
  readonly autoLevel?: Level;
  /** `level` was picked by hand, not the automatic level. */
  readonly chosen?: boolean;
  /** The levels the learner can pick, with their progress; fewer than two: no picker. */
  readonly levels?: readonly HomePathLevel[];
};

export type HomeViewState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | {
      readonly status: "ready";
      /** Exercises the next daily review serves (`reviewOutlook(...).next`). */
      readonly pendingReviews: number;
      /** Exercises later reviews will serve today, once the next one is done (absent: none). */
      readonly laterReviews?: number;
      /** Paper of today's review sticky note. */
      readonly reviewNoteColor: HighlighterName;
      readonly streakDays: number;
      readonly xp: number;
      /** The plumas balance (negative after concurrent offline purchases). */
      readonly plumas?: number;
      readonly level: Level | null;
      /** Lessons of the learner's level (or the default level). */
      readonly lessons: HomeLessons;
      /** Album stickers won, out of the whole album. */
      readonly album?: { readonly unlocked: number; readonly total: number };
      /** Study cards ("Fichas"), and how many the learner studied. */
      readonly cards?: { readonly total: number; readonly studied: number };
      /** Titles of the "Práctica libre" collections (none: no link). */
      readonly practiceTopics?: readonly string[];
    };

type HomeViewProps = {
  state: HomeViewState;
  /** Sounds are on (the switch at the top offers to mute them). */
  soundEnabled: boolean;
  onToggleSound: () => void;
  /** The theme switch beside it (home only: exercise headers keep just the sound one). */
  themePreference: ThemePreference;
  onCycleTheme: () => void;
  onOpenLesson: (lessonId: string) => void;
  onStartPlacement: () => void;
  onOpenReview: () => void;
  onOpenAbout: () => void;
  /** Shows the "Cuenta" link next to the sound switch. */
  onOpenAccount?: () => void;
  onOpenAlbum?: () => void;
  onOpenCards?: () => void;
  /** "Práctica libre", under the study cards. */
  onOpenPractice?: () => void;
  /** Makes the plumas balance the way into Avi's wardrobe. */
  onOpenWardrobe?: () => void;
  /** Opens one study card (the "Profundiza" steps under done lessons). */
  onOpenCard?: (cardId: string) => void;
  /** Shows the path of a level picked by hand; null goes back to the automatic level. */
  onChoosePathLevel?: (level: Level | null) => void;
  /** News above everything but the greeting (the old web address's move banner). */
  notice?: ReactNode;
  /** The signed-in learner's first name for the greeting; without it, a plain "¡Hola!". */
  greetingName?: string | undefined;
  /** The one-time plumas note, under the progress card. */
  plumasNote?: ReactNode;
  /** Avi beside the greeting (with `onOpenWardrobe`, which tapping it opens). */
  avi?: HomeGreetingAvi | undefined;
};

type Ready = Extract<HomeViewState, { status: "ready" }>;

/** Consecutive lessons of the same topic, in catalog order, with their number in the level. */
function groupByTopic(lessons: readonly HomeLesson[]) {
  const groups: { topic: string; lessons: { lesson: HomeLesson; number: number }[] }[] = [];
  lessons.forEach((lesson, i) => {
    const entry = { lesson, number: i + 1 };
    const last = groups[groups.length - 1];
    if (last !== undefined && last.topic === lesson.topic) last.lessons.push(entry);
    else groups.push({ topic: lesson.topic, lessons: [entry] });
  });
  return groups;
}

/**
 * The top of the page: the streak as a chain of paperclips with the number of days, the sound
 * and account controls, the XP as sheets of stickers and the plumas balance.
 */
function ProgressCard({
  days,
  xp,
  plumas,
  onOpenWardrobe,
  controls,
  album,
  onOpenAlbum,
  cards,
  onOpenCards,
  practiceTopics,
  onOpenPractice,
}: {
  /** `null` while the progress loads: a dash, never a "0 días" that then jumps. */
  days: number | null;
  xp: number | null;
  plumas?: number | undefined;
  onOpenWardrobe?: (() => void) | undefined;
  controls: ReactNode;
  album?: { readonly unlocked: number; readonly total: number } | undefined;
  onOpenAlbum?: (() => void) | undefined;
  cards?: { readonly total: number; readonly studied: number } | undefined;
  onOpenCards?: (() => void) | undefined;
  practiceTopics?: readonly string[] | undefined;
  onOpenPractice?: (() => void) | undefined;
}) {
  const styles = useStyles();
  const known = days !== null;
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View
          accessible
          accessibilityLabel={known ? `Racha: ${formatDays(days)}` : "Racha: cargando"}
          style={styles.streak}
        >
          <ClipChainMark days={days ?? 0} />
          <View>
            <Text
              variant="display"
              tone={known ? (days > 0 ? "ink" : "text") : "muted"}
              style={styles.streakNumber}
            >
              {known ? String(days) : "–"}
            </Text>
            <Text variant="smallStrong" tone="muted">
              {known ? `${days === 1 ? "día" : "días"} de racha` : "racha"}
            </Text>
          </View>
        </View>
        <View style={styles.controls}>{controls}</View>
      </View>
      {xp !== null && <XpBar xp={xp} />}
      {plumas !== undefined && <PlumasBalance balance={plumas} onPress={onOpenWardrobe} />}
      {album !== undefined && onOpenAlbum !== undefined && (
        <AlbumLink album={album} onPress={onOpenAlbum} />
      )}
      {cards !== undefined && cards.total > 0 && onOpenCards !== undefined && (
        <CardsLink cards={cards} onPress={onOpenCards} />
      )}
      {practiceTopics !== undefined &&
        practiceTopics.length > 0 &&
        onOpenPractice !== undefined && (
          <PracticeLink topics={practiceTopics} onPress={onOpenPractice} />
        )}
    </View>
  );
}

/** "Fichas · 28 fichas · 3 estudiadas", under the album: the way to the study cards. */
function CardsLink({
  cards,
  onPress,
}: {
  cards: { readonly total: number; readonly studied: number };
  onPress: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const count = cardsCount(cards.total, cards.studied);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Fichas: ${count.replace(" · ", ", ")}`}
      onPress={onPress}
      style={({ pressed }) => [styles.albumLink, pressed && styles.stopPressed]}
    >
      {/* A small ruled index card with a highlighter tab (decorative). */}
      <View style={styles.albumStickers}>
        <Svg width={44} height={34} viewBox="0 0 44 34" aria-hidden>
          <Path
            d="M5 6 h32 a3 3 0 0 1 3 3 v19 a3 3 0 0 1 -3 3 h-32 a3 3 0 0 1 -3 -3 v-19 a3 3 0 0 1 3 -3 z"
            fill={colors.sheet}
            stroke={colors.ink}
            strokeWidth={2}
            transform="rotate(-5 22 17)"
          />
          <Path
            d="M9 15 h24 M9 21 h24 M9 27 h16"
            stroke={colors.rule}
            strokeWidth={2}
            strokeLinecap="round"
            transform="rotate(-5 22 17)"
          />
          <Path
            d="M28 2 h10 v8 h-10 z"
            fill={colors.highlighters.lilac}
            transform="rotate(-5 22 17)"
          />
        </Svg>
      </View>
      <View style={styles.albumText}>
        <Text variant="bodyStrong" tone="ink">
          Fichas
        </Text>
        <Text variant="small" tone="muted">
          {count}
        </Text>
      </View>
      <Svg width={20} height={20} viewBox="0 0 24 24" aria-hidden>
        <Path
          d="M9 5l7 7-7 7"
          fill="none"
          stroke={colors.ink}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </PressableScale>
  );
}

/**
 * "Práctica libre · Phrasal verbs, a tu ritmo", under the study cards: free practice by topic,
 * apart from the path (secondary to it, like the cards).
 */
function PracticeLink({ topics, onPress }: { topics: readonly string[]; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const subtitle = `${topics.join(", ")}, a tu ritmo`;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Práctica libre: ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [styles.albumLink, pressed && styles.stopPressed]}
    >
      {/* A small spiral notebook with a highlighter stripe (decorative). */}
      <View style={styles.albumStickers}>
        <Svg width={44} height={34} viewBox="0 0 44 34" aria-hidden>
          <Path
            d="M10 4 h26 a3 3 0 0 1 3 3 v21 a3 3 0 0 1 -3 3 h-26 z"
            fill={colors.sheet}
            stroke={colors.ink}
            strokeWidth={2}
            transform="rotate(4 22 17)"
          />
          <Path
            d="M15 13 h18"
            stroke={colors.highlighters.green}
            strokeWidth={5}
            transform="rotate(4 22 17)"
          />
          <Path
            d="M15 21 h18 M15 26 h11"
            stroke={colors.rule}
            strokeWidth={2}
            strokeLinecap="round"
            transform="rotate(4 22 17)"
          />
          <Path
            d="M6 8 h7 M6 14 h7 M6 20 h7 M6 26 h7"
            stroke={colors.ink}
            strokeWidth={2}
            strokeLinecap="round"
            transform="rotate(4 22 17)"
          />
        </Svg>
      </View>
      <View style={styles.albumText}>
        <Text variant="bodyStrong" tone="ink">
          Práctica libre
        </Text>
        <Text variant="small" tone="muted">
          {subtitle}
        </Text>
      </View>
      <Svg width={20} height={20} viewBox="0 0 24 24" aria-hidden>
        <Path
          d="M9 5l7 7-7 7"
          fill="none"
          stroke={colors.ink}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </PressableScale>
  );
}

/** "Mi álbum · 3 de 16 insignias", under the XP: the way to the album. */
function AlbumLink({
  album,
  onPress,
}: {
  album: { readonly unlocked: number; readonly total: number };
  onPress: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const count = `${album.unlocked} de ${album.total} insignias`;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Mi álbum: ${count}`}
      onPress={onPress}
      style={({ pressed }) => [styles.albumLink, pressed && styles.stopPressed]}
    >
      <View style={styles.albumStickers}>
        <Sticker color="pink" size={30} tilt={-8} />
        <Sticker color="sky" size={30} tilt={6} style={styles.albumSecond} />
      </View>
      <View style={styles.albumText}>
        <Text variant="bodyStrong" tone="ink">
          Mi álbum
        </Text>
        <Text variant="small" tone="muted">
          {count}
        </Text>
      </View>
      <Svg width={20} height={20} viewBox="0 0 24 24" aria-hidden>
        <Path
          d="M9 5l7 7-7 7"
          fill="none"
          stroke={colors.ink}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </PressableScale>
  );
}

function ReviewNote({
  pending,
  later,
  color,
  onOpenReview,
}: {
  pending: number;
  later: number;
  color: HighlighterName;
  onOpenReview: () => void;
}) {
  const styles = useStyles();
  if (pending === 0) {
    return (
      <View style={styles.emptyReview}>
        <Avi testID="avi-nap" mood="sleepy" size={52} />
        <Text tone="muted">Nada para repasar hoy</Text>
      </View>
    );
  }
  return (
    <View style={styles.sticky}>
      <StickyNote color={color}>
        <View style={styles.stickyRow}>
          <View style={styles.stickyText}>
            <Text variant="title">Repaso</Text>
            <Text>{`${pending} ${pending === 1 ? "pendiente" : "pendientes"}`}</Text>
            {later > 0 && <Text tone="muted">{`y ${later} más después`}</Text>}
          </View>
          <Button label="Repasar" onPress={onOpenReview} />
        </View>
      </StickyNote>
    </View>
  );
}

/** Where each stop sits across the page: the path zigzags gently down it. */
const STOP_OFFSETS = [0, 0.16, 0.32, 0.16] as const;
/** Won stickers are stuck slightly askew, never twice the same way in a row. */
const TILTS = [-6, 5, -3, 7] as const;
/** The column that holds a stop's sticker (the next one is the biggest). */
const STICKER_COLUMN = 84;
const CONNECTOR_HEIGHT = 22;

type StopKind = "done" | "next" | "pending";

/** "Mi rutina, completada con errores: 5 de 6 correctas", or just the title when not done. */
function stopLabel(lesson: HomeLesson): string {
  return lesson.done ? `${lesson.title}, ${scoreDescription(lesson.score)}` : lesson.title;
}

/** The hint of a stop: the next lesson, or a done one worth redoing for a perfect page. */
function stopHint(lesson: HomeLesson, kind: StopKind): string | undefined {
  if (kind === "next") return "Tu siguiente lección";
  if (kind === "done" && lesson.score !== undefined && !lesson.score.perfect) {
    return "Repítela para sacar todo bien";
  }
  return undefined;
}

function stopKind(lesson: HomeLesson, nextId: string | undefined): StopKind {
  if (lesson.done) return "done";
  return lesson.id === nextId ? "next" : "pending";
}

/** One lesson on the path: its sticker (won, to win next, or an empty slot) and its title. */
function PathStop({
  lesson,
  number,
  topic,
  kind,
  offset,
  previousOffset,
  onPress,
}: {
  lesson: HomeLesson;
  number: number;
  topic: string;
  kind: StopKind;
  offset: number;
  /** Where the stop before it on the same topic sits, if any: Avi points along that line. */
  previousOffset: number | undefined;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const tilt = TILTS[number % TILTS.length] ?? 0;
  const hint = stopHint(lesson, kind);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={stopLabel(lesson)}
      {...(hint === undefined ? {} : { accessibilityHint: hint })}
      onPress={onPress}
      wrapperStyle={{ marginLeft: `${offset * 100}%` }}
      style={({ pressed }) => [styles.stop, pressed && styles.stopPressed]}
    >
      <View style={styles.stickerColumn}>
        {kind === "done" && (
          <Sticker
            color={topicHighlighter(topic)}
            tilt={tilt}
            size={60}
            slap={lesson.justCompleted === true}
            delayMs={250}
          >
            <HandCheck
              testID={`check-${lesson.id}`}
              animate={lesson.justCompleted === true}
              color={colors.onHighlighter}
              delayMs={650}
            />
          </Sticker>
        )}
        {kind === "done" && lesson.score?.perfect === true && (
          <PerfectBadge testID={`perfect-${lesson.id}`} style={styles.perfectBadge} />
        )}
        {kind === "next" && (
          <>
            <Sticker color="yellow" state="current" size={76}>
              <Text variant="heading" style={{ color: colors.onHighlighter }}>
                {String(number)}
              </Text>
            </Sticker>
            <Guide previousOffset={previousOffset} offset={offset} />
          </>
        )}
        {kind === "pending" && (
          <Sticker color="sky" state="pending" size={54}>
            <Text variant="title" tone="muted">
              {String(number)}
            </Text>
          </Sticker>
        )}
      </View>
      <View style={styles.stopText}>
        <Text variant={kind === "next" ? "bodyStrong" : "body"}>{lesson.title}</Text>
        {kind === "done" && (
          <Text variant="smallStrong" tone="success">
            {scoreText(lesson.score)}
          </Text>
        )}
        {kind === "next" && (
          <View style={styles.nextChip}>
            <Text variant="smallStrong" style={{ color: colors.onHighlighter }}>
              Siguiente
            </Text>
          </View>
        )}
      </View>
    </PressableScale>
  );
}

/** "Profundiza: <título>, ficha nueva" or "…, completada sin errores: 6 de 6 correctas". */
function deepenLabel(card: HomeDeepenCard): string {
  const state = card.score === undefined ? "ficha nueva" : scoreDescription(card.score);
  return `Profundiza: ${card.title}, ${state}`;
}

/**
 * The cards that go deeper into a done lesson, as loose index cards clipped under its sticker:
 * smaller than a stop, so they never read as another lesson. The pencil line runs on beside them
 * when the path goes on. Never animated beyond the shared press feedback.
 */
function DeepenSteps({
  lessonId,
  cards,
  offset,
  continues,
  onOpenCard,
}: {
  lessonId: string;
  cards: readonly HomeDeepenCard[];
  offset: number;
  /**
   * Another stop of the topic follows: the pencil line goes on beside the cards, solid when that
   * stop is done too, dotted ahead (like the line between stops).
   */
  continues: "drawn" | "ahead" | false;
  onOpenCard: (cardId: string) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.deepen, { marginLeft: `${offset * 100}%` }]}>
      <View style={styles.deepenTrail}>
        {continues !== false && (
          <Svg
            testID={`deepen-trail-${lessonId}`}
            aria-hidden
            width={6}
            height="100%"
            style={styles.deepenLine}
          >
            <Line
              x1={3}
              y1={0}
              x2={3}
              y2="100%"
              stroke={colors.ink}
              strokeWidth={continues === "drawn" ? 3.5 : 3}
              strokeLinecap="round"
              {...(continues === "drawn" ? {} : { strokeDasharray: "1 8" })}
              opacity={continues === "drawn" ? 0.9 : 0.55}
            />
          </Svg>
        )}
      </View>
      <View style={styles.deepenList}>
        {cards.map((card) => (
          <PressableScale
            key={card.id}
            accessibilityRole="button"
            accessibilityLabel={deepenLabel(card)}
            accessibilityHint="Abre la ficha"
            onPress={() => onOpenCard(card.id)}
            wrapperStyle={styles.deepenWrapper}
            style={({ pressed }) => [styles.deepenStep, pressed && styles.stopPressed]}
          >
            {/* A small ruled index card with a highlighter tab (decorative). */}
            <View>
              <Svg width={26} height={20} viewBox="0 0 44 34" aria-hidden>
                <Path
                  d="M5 6 h32 a3 3 0 0 1 3 3 v19 a3 3 0 0 1 -3 3 h-32 a3 3 0 0 1 -3 -3 v-19 a3 3 0 0 1 3 -3 z"
                  fill={colors.sheet}
                  stroke={colors.ink}
                  strokeWidth={2.5}
                  transform="rotate(-5 22 17)"
                />
                <Path
                  d="M9 15 h24 M9 21 h24"
                  stroke={colors.rule}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  transform="rotate(-5 22 17)"
                />
                <Path
                  d="M28 2 h10 v8 h-10 z"
                  fill={colors.highlighters.lilac}
                  transform="rotate(-5 22 17)"
                />
              </Svg>
              {card.score?.perfect === true && (
                <PerfectBadge
                  testID={`deepen-perfect-${lessonId}-${card.id}`}
                  size={18}
                  style={styles.deepenBadge}
                />
              )}
            </View>
            {/* The marker goes under the title when both don't fit on one line. */}
            <View style={styles.deepenBody}>
              <View style={styles.deepenText}>
                <Text variant="small" tone="muted">
                  Profundiza
                </Text>
                <Text variant="smallStrong" tone="ink">
                  {card.title}
                </Text>
              </View>
              {card.score === undefined ? (
                <Text variant="small" tone="muted" style={styles.deepenMarker}>
                  Nueva
                </Text>
              ) : (
                <Text variant="smallStrong" tone="success" style={styles.deepenMarker}>
                  {scoreText(card.score)}
                </Text>
              )}
            </View>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

/** Avi on the next sticker, pointing down along the pencil line that comes to it. */
function Guide({ previousOffset, offset }: { previousOffset: number | undefined; offset: number }) {
  const styles = useStyles();
  const heading = guideHeading(previousOffset, offset);
  return (
    <Avi
      testID="avi-guide"
      fly
      delayMs={200}
      size={40}
      tilt={heading.tilt}
      facing={heading.facing}
      style={heading.corner === "left" ? styles.guideLeft : styles.guideRight}
    />
  );
}

/** The pencil line between two stops: solid where both are done, dotted ahead. */
function Connector({
  width,
  from,
  to,
  drawn,
}: {
  width: number;
  from: number;
  to: number;
  drawn: boolean;
}) {
  const { colors } = useTheme();
  if (width === 0) return <View style={{ height: CONNECTOR_HEIGHT }} />;
  const x1 = from * width + STICKER_COLUMN / 2;
  const x2 = to * width + STICKER_COLUMN / 2;
  const h = CONNECTOR_HEIGHT;
  return (
    <Svg
      aria-hidden
      width={width}
      height={h}
      viewBox={`0 0 ${width} ${h}`}
      style={{ marginVertical: -4 }}
    >
      <Path
        d={`M${x1} 0 C ${x1} ${h * 0.6}, ${x2} ${h * 0.4}, ${x2} ${h}`}
        fill="none"
        stroke={colors.ink}
        strokeWidth={drawn ? 3.5 : 3}
        strokeLinecap="round"
        {...(drawn ? {} : { strokeDasharray: "1 8" })}
        opacity={drawn ? 0.9 : 0.55}
      />
    </Svg>
  );
}

/**
 * The level's lessons as a path of stickers drawn in pencil down the page, grouped by topic: won
 * lessons are stickers with a check, the next one is a big yellow sticker where Avi waits, the
 * rest are empty slots. Nothing is locked: any stop opens its lesson.
 */
function LessonIndex({
  lessons,
  onOpenLesson,
  onOpenCard,
  onChoosePathLevel,
}: {
  lessons: HomeLessons;
  onOpenLesson: (id: string) => void;
  onOpenCard?: ((cardId: string) => void) | undefined;
  onChoosePathLevel?: ((level: Level | null) => void) | undefined;
}) {
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const done = lessons.items.filter((l) => l.done).length;
  const total = lessons.items.length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const nextId = lessons.items.find((l) => !l.done)?.id;
  return (
    <View style={styles.index}>
      <View style={styles.indexHeader}>
        <Text accessibilityRole="header" variant="heading">
          {`Lecciones de nivel ${lessons.level}`}
        </Text>
        {onChoosePathLevel !== undefined &&
          lessons.levels !== undefined &&
          lessons.levels.length > 1 && (
            <PathLevelPicker
              level={lessons.level}
              autoLevel={lessons.autoLevel ?? lessons.level}
              chosen={lessons.chosen ?? false}
              levels={lessons.levels}
              onChoose={onChoosePathLevel}
            />
          )}
        {total > 0 && (
          <>
            <ProgressLine value={done} max={total} label={`Progreso del nivel ${lessons.level}`} />
            <Text variant="small" tone="muted">{`${percent} % completado`}</Text>
          </>
        )}
      </View>
      {total === 0 ? (
        <Text tone="muted">Todavía no hay lecciones para este nivel.</Text>
      ) : (
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.path}>
          {groupByTopic(lessons.items).map((group, g) => (
            <View key={`${group.topic}-${g}`} style={styles.topic}>
              {/* The topic's colored label, like a tab in the notebook's index. */}
              <View style={styles.topicTab}>
                <Highlight variant="smallStrong" color={topicHighlighter(group.topic)}>
                  {topicLabel(group.topic)}
                </Highlight>
              </View>
              {group.lessons.map(({ lesson, number }, i) => {
                const offset = STOP_OFFSETS[(number - 1) % STOP_OFFSETS.length] ?? 0;
                const previous = group.lessons[i - 1];
                const next = group.lessons[i + 1];
                const previousOffset =
                  previous === undefined
                    ? undefined
                    : (STOP_OFFSETS[(previous.number - 1) % STOP_OFFSETS.length] ?? 0);
                return (
                  <View key={lesson.id}>
                    {previous !== undefined && (
                      <Connector
                        width={width}
                        from={previousOffset ?? 0}
                        to={offset}
                        drawn={previous.lesson.done && lesson.done}
                      />
                    )}
                    <PathStop
                      lesson={lesson}
                      number={number}
                      topic={group.topic}
                      kind={stopKind(lesson, nextId)}
                      offset={offset}
                      previousOffset={previousOffset}
                      onPress={() => onOpenLesson(lesson.id)}
                    />
                    {lesson.done &&
                      onOpenCard !== undefined &&
                      lesson.deepen !== undefined &&
                      lesson.deepen.length > 0 && (
                        <DeepenSteps
                          lessonId={lesson.id}
                          cards={lesson.deepen}
                          offset={offset}
                          continues={
                            next === undefined ? false : next.lesson.done ? "drawn" : "ahead"
                          }
                          onOpenCard={onOpenCard}
                        />
                      )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ReadyHome({
  state,
  onOpenLesson,
  onOpenCard,
  onChoosePathLevel,
  onStartPlacement,
  onOpenReview,
  onOpenAbout,
}: Omit<
  HomeViewProps,
  "state" | "soundEnabled" | "onToggleSound" | "themePreference" | "onCycleTheme" | "greetingName"
> & { state: Ready }) {
  const styles = useStyles();
  return (
    <>
      <ReviewNote
        pending={state.pendingReviews}
        later={state.laterReviews ?? 0}
        color={state.reviewNoteColor}
        onOpenReview={onOpenReview}
      />

      {state.level === null && (
        <View style={styles.placement}>
          <Text variant="title">Aún no conocemos tu nivel.</Text>
          <Text tone="muted">Un test corto, de unos 5 minutos, para elegir tus lecciones.</Text>
          <Button
            label="Hacer test de nivel"
            accessibilityHint="Abre un test corto para encontrar tu nivel de inglés"
            onPress={onStartPlacement}
          />
        </View>
      )}

      <LessonIndex
        lessons={state.lessons}
        onOpenLesson={onOpenLesson}
        onOpenCard={onOpenCard}
        onChoosePathLevel={onChoosePathLevel}
      />

      <View style={styles.footer}>
        {state.level !== null && (
          <View style={styles.level}>
            <Text tone="muted">{`Tu nivel: ${state.level}`}</Text>
            <Button
              label="Repetir test de nivel"
              variant="text"
              accessibilityHint="Vuelve a hacer el test; el nuevo resultado reemplaza al anterior"
              onPress={onStartPlacement}
            />
          </View>
        )}
        <Button label="Acerca de" variant="text" onPress={onOpenAbout} />
      </View>
    </>
  );
}

export function HomeView({
  state,
  soundEnabled,
  onToggleSound,
  themePreference,
  onCycleTheme,
  onOpenAccount,
  onOpenAlbum,
  onOpenCards,
  onOpenPractice,
  onOpenWardrobe,
  notice,
  greetingName,
  plumasNote,
  avi,
  ...handlers
}: HomeViewProps) {
  const { colors } = useTheme();
  const controls = (
    <>
      {onOpenAccount !== undefined && <AccountLink onPress={onOpenAccount} />}
      <ThemeToggleButton preference={themePreference} onCycle={onCycleTheme} />
      <SoundToggleButton enabled={soundEnabled} onToggle={onToggleSound} />
    </>
  );
  return (
    <ScreenContainer insetTop>
      <HomeGreeting name={greetingName} avi={avi} onOpenWardrobe={onOpenWardrobe} />
      {notice}
      <ProgressCard
        days={state.status === "ready" ? state.streakDays : null}
        xp={state.status === "ready" ? state.xp : null}
        plumas={state.status === "ready" ? state.plumas : undefined}
        onOpenWardrobe={onOpenWardrobe}
        controls={controls}
        album={state.status === "ready" ? state.album : undefined}
        onOpenAlbum={onOpenAlbum}
        cards={state.status === "ready" ? state.cards : undefined}
        onOpenCards={onOpenCards}
        practiceTopics={state.status === "ready" ? state.practiceTopics : undefined}
        onOpenPractice={onOpenPractice}
      />
      {plumasNote}
      {state.status === "loading" && (
        <ActivityIndicator accessibilityLabel="Cargando tu progreso" color={colors.ink} />
      )}

      {state.status === "error" && (
        <Text accessibilityRole="alert" tone="redPen">
          No pudimos cargar tu progreso.
        </Text>
      )}

      {state.status === "ready" && <ReadyHome state={state} {...handlers} />}
    </ScreenContainer>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    card: {
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.sheet,
      boxShadow: `0 3px 0 ${colors.rule}`,
    },
    cardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
    streak: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexShrink: 1 },
    streakNumber: { lineHeight: 36 },
    controls: { flexDirection: "row", alignItems: "center", marginRight: -spacing.sm },
    albumLink: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.xs,
      paddingRight: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: colors.rule,
      marginTop: -spacing.xs,
      paddingTop: spacing.sm,
    },
    albumStickers: { flexDirection: "row", width: 52 },
    albumSecond: { marginLeft: -14 },
    albumText: { flex: 1 },
    emptyReview: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    // A strip of sticky note across the page: what is due, and the button to review it.
    sticky: { paddingHorizontal: spacing.xs },
    stickyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" },
    stickyText: { flex: 1, minWidth: 140 },
    placement: {
      gap: spacing.sm,
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.rule,
    },
    index: { gap: spacing.lg },
    indexHeader: { gap: spacing.sm },
    path: { gap: spacing.lg },
    topic: { gap: 0 },
    topicTab: { marginBottom: spacing.sm, alignSelf: "flex-start" },
    stop: {
      minHeight: 84,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingRight: spacing.sm,
      borderRadius: radius.lg,
    },
    stopPressed: { backgroundColor: colors.rule },
    stickerColumn: {
      width: STICKER_COLUMN,
      height: 84,
      alignItems: "center",
      justifyContent: "center",
    },
    // Avi perches at the top corner of the next sticker the pencil line comes from.
    perfectBadge: { position: "absolute", right: 2, top: 2 },
    guideLeft: { position: "absolute", left: -2, top: -12 },
    guideRight: { position: "absolute", right: -2, top: -12 },
    stopText: { flexShrink: 1, gap: 2, alignItems: "flex-start" },
    nextChip: {
      backgroundColor: colors.highlighters.yellow,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 1,
    },
    // Under a done stop: the pencil line's column, then the cards, smaller than a stop.
    deepen: { flexDirection: "row", alignItems: "stretch" },
    // On a narrow phone the column gives up its room right of the line first, so the cards keep
    // enough width for their title and marker.
    deepenTrail: {
      width: STICKER_COLUMN,
      minWidth: STICKER_COLUMN / 2 + spacing.sm,
      flexShrink: 20,
    },
    // Out of the flow, so the line never makes the row taller than its cards.
    deepenLine: { position: "absolute", top: 0, bottom: 0, left: STICKER_COLUMN / 2 - 3 },
    deepenList: { flexShrink: 1, gap: spacing.xs, paddingVertical: spacing.xs },
    deepenWrapper: { alignSelf: "flex-start", maxWidth: "100%" },
    deepenStep: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.md,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.textMuted,
      backgroundColor: colors.sheet,
    },
    deepenBadge: { position: "absolute", right: -8, top: -10 },
    deepenBody: {
      flexShrink: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      columnGap: spacing.sm,
    },
    deepenText: { flexShrink: 1 },
    // The title wraps, never the marker ("Perfecta · 8/8"): a web Text shrinks by default.
    deepenMarker: { flexShrink: 0 },
    footer: {
      marginTop: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.rule,
    },
    level: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: spacing.md },
  }),
);
