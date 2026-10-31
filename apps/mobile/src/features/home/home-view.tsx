import type { Level } from "@english-learn/domain";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Button } from "@/shared/ui/button";
import { formatDays } from "@/shared/ui/format";
import { ClipChainMark } from "@/shared/ui/clip-chain";
import { HandCheck } from "@/shared/ui/hand-check";
import { Highlight } from "@/shared/ui/highlight";
import { SoundToggleButton } from "@/shared/ui/sound-toggle-button";
import { AccountLink } from "@/features/account/account-link";
import { PressableScale } from "@/shared/ui/pressable-scale";
import { ProgressLine } from "@/shared/ui/progress-line";
import { Avi } from "@/shared/ui/mascot";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Sticker } from "@/shared/ui/sticker";
import { StickyNote } from "@/shared/ui/sticky-note";
import { Text } from "@/shared/ui/text";
import { radius, spacing, type HighlighterName } from "@/shared/ui/theme";
import { XpBar } from "@/shared/ui/xp-bar";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { topicHighlighter } from "@/features/topics/topic-colors";
import { topicLabel } from "@/features/topics/topic-labels";

export type HomeLesson = {
  readonly id: string;
  readonly title: string;
  /** Topic slug (e.g. "daily-routine"); the index groups lessons by it. */
  readonly topic: string;
  readonly done: boolean;
  /** Completed since the index was last seen: its check is drawn now, once. */
  readonly justCompleted?: boolean;
};

export type HomeLessons = { readonly level: Level; readonly items: readonly HomeLesson[] };

export type HomeViewState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | {
      readonly status: "ready";
      /** Items the daily review would practice today. */
      readonly pendingReviews: number;
      /** Paper of today's review sticky note. */
      readonly reviewNoteColor: HighlighterName;
      readonly streakDays: number;
      readonly xp: number;
      readonly level: Level | null;
      /** Lessons of the learner's level (or the default level). */
      readonly lessons: HomeLessons;
    };

type HomeViewProps = {
  state: HomeViewState;
  /** Sounds are on (the switch at the top offers to mute them). */
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenLesson: (lessonId: string) => void;
  onStartPlacement: () => void;
  onOpenReview: () => void;
  onOpenAbout: () => void;
  /** Shows the "Cuenta" link next to the sound switch. */
  onOpenAccount?: () => void;
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
 * and account controls, and the XP as sheets of stickers.
 */
function ProgressCard({
  days,
  xp,
  controls,
}: {
  days: number;
  xp: number | null;
  controls: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View accessible accessibilityLabel={`Racha: ${formatDays(days)}`} style={styles.streak}>
          <ClipChainMark days={days} />
          <View>
            <Text variant="display" tone={days > 0 ? "ink" : "text"} style={styles.streakNumber}>
              {String(days)}
            </Text>
            <Text variant="smallStrong" tone="muted">
              {`${days === 1 ? "día" : "días"} de racha`}
            </Text>
          </View>
        </View>
        <View style={styles.controls}>{controls}</View>
      </View>
      {xp !== null && <XpBar xp={xp} />}
    </View>
  );
}

function ReviewNote({
  pending,
  color,
  onOpenReview,
}: {
  pending: number;
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
        <Text variant="title">Repaso</Text>
        <Text>{`${pending} ${pending === 1 ? "pendiente" : "pendientes"}`}</Text>
        <View style={styles.stickyAction}>
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
  onPress,
}: {
  lesson: HomeLesson;
  number: number;
  topic: string;
  kind: StopKind;
  offset: number;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const tilt = TILTS[number % TILTS.length] ?? 0;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={lesson.done ? `${lesson.title}, completada` : lesson.title}
      {...(kind === "next" ? { accessibilityHint: "Tu siguiente lección" } : {})}
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
        {kind === "next" && (
          <>
            <Sticker color="yellow" state="current" size={76}>
              <Text variant="heading" style={{ color: colors.onHighlighter }}>
                {String(number)}
              </Text>
            </Sticker>
            <Avi testID="avi-guide" fly delayMs={200} size={40} style={styles.guide} />
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
            Completada
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
}: {
  lessons: HomeLessons;
  onOpenLesson: (id: string) => void;
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
                return (
                  <View key={lesson.id}>
                    {previous !== undefined && (
                      <Connector
                        width={width}
                        from={STOP_OFFSETS[(previous.number - 1) % STOP_OFFSETS.length] ?? 0}
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
                      onPress={() => onOpenLesson(lesson.id)}
                    />
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
  onStartPlacement,
  onOpenReview,
  onOpenAbout,
}: Omit<HomeViewProps, "state" | "soundEnabled" | "onToggleSound"> & { state: Ready }) {
  const styles = useStyles();
  return (
    <>
      <ReviewNote
        pending={state.pendingReviews}
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

      <LessonIndex lessons={state.lessons} onOpenLesson={onOpenLesson} />

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
  onOpenAccount,
  ...handlers
}: HomeViewProps) {
  const { colors } = useTheme();
  const controls = (
    <>
      {onOpenAccount !== undefined && <AccountLink onPress={onOpenAccount} />}
      <SoundToggleButton enabled={soundEnabled} onToggle={onToggleSound} />
    </>
  );
  return (
    <ScreenContainer insetTop>
      <ProgressCard
        days={state.status === "ready" ? state.streakDays : 0}
        xp={state.status === "ready" ? state.xp : null}
        controls={controls}
      />
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
    emptyReview: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    sticky: { paddingHorizontal: spacing.xs, alignItems: "flex-start" },
    stickyAction: { marginTop: spacing.sm, alignSelf: "flex-start" },
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
    // Avi perches at the top left of the next sticker.
    guide: { position: "absolute", left: -2, top: -12 },
    stopText: { flexShrink: 1, gap: 2, alignItems: "flex-start" },
    nextChip: {
      backgroundColor: colors.highlighters.yellow,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 1,
    },
    footer: {
      marginTop: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.rule,
    },
    level: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: spacing.md },
  }),
);
