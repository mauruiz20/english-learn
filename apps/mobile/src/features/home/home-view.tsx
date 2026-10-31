import type { Level } from "@english-learn/domain";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Button } from "@/shared/ui/button";
import { formatDays } from "@/shared/ui/format";
import { Doodle } from "@/shared/ui/doodle";
import { HandCheck } from "@/shared/ui/hand-check";
import { Highlight } from "@/shared/ui/highlight";
import { SoundToggleButton } from "@/shared/ui/sound-toggle-button";
import { PressableScale } from "@/shared/ui/pressable-scale";
import { ProgressLine } from "@/shared/ui/progress-line";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { StickyNote } from "@/shared/ui/sticky-note";
import { Text } from "@/shared/ui/text";
import { spacing, type HighlighterName } from "@/shared/ui/theme";
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
};

type Ready = Extract<HomeViewState, { status: "ready" }>;

/** Consecutive lessons of the same topic, in catalog order. */
function groupByTopic(lessons: readonly HomeLesson[]) {
  const groups: { topic: string; lessons: HomeLesson[] }[] = [];
  for (const lesson of lessons) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.topic === lesson.topic) last.lessons.push(lesson);
    else groups.push({ topic: lesson.topic, lessons: [lesson] });
  }
  return groups;
}

/** The streak written large, with a highlighter swipe behind the number. */
function Streak({ days, xp }: { days: number; xp: number }) {
  const styles = useStyles();
  return (
    <View style={styles.hero}>
      <View accessible accessibilityLabel={`Racha: ${formatDays(days)}`} style={styles.streak}>
        {days > 0 ? (
          <Highlight variant="hero" shape="swipe" style={styles.streakNumber}>
            {String(days)}
          </Highlight>
        ) : (
          // No streak yet: nothing to celebrate, so no highlighter.
          <Text variant="hero" tone="text" style={styles.streakNumber}>
            0
          </Text>
        )}
        <Text variant="title" tone="ink" style={styles.streakUnit}>
          {`${days === 1 ? "día" : "días"} de racha`}
        </Text>
      </View>
      <Text tone="muted">{`${xp} XP`}</Text>
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
        <Doodle name="rest" size={0.75} />
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

function LessonRow({ lesson, onPress }: { lesson: HomeLesson; onPress: () => void }) {
  const styles = useStyles();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={lesson.done ? `${lesson.title}, completada` : lesson.title}
      onPress={onPress}
      style={({ pressed }) => [styles.lesson, pressed && styles.pressed]}
    >
      <Text style={styles.lessonTitle}>{lesson.title}</Text>
      <View style={styles.leader} />
      {lesson.done ? (
        <View style={styles.doneMark}>
          <HandCheck testID={`check-${lesson.id}`} animate={lesson.justCompleted === true} />
          <Text variant="smallStrong" tone="success">
            Completada
          </Text>
        </View>
      ) : (
        <Text tone="muted" style={styles.pendingMark}>
          ○
        </Text>
      )}
    </PressableScale>
  );
}

function LessonIndex({
  lessons,
  onOpenLesson,
}: {
  lessons: HomeLessons;
  onOpenLesson: (id: string) => void;
}) {
  const styles = useStyles();
  const done = lessons.items.filter((l) => l.done).length;
  const total = lessons.items.length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
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
        groupByTopic(lessons.items).map((group, i) => (
          <View key={`${group.topic}-${i}`} style={styles.topic}>
            {/* The topic's colored index tab. */}
            <View style={styles.topicTab}>
              <Highlight variant="smallStrong" color={topicHighlighter(group.topic)}>
                {topicLabel(group.topic)}
              </Highlight>
            </View>
            {group.lessons.map((lesson) => (
              <LessonRow key={lesson.id} lesson={lesson} onPress={() => onOpenLesson(lesson.id)} />
            ))}
          </View>
        ))
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
      <Streak days={state.streakDays} xp={state.xp} />

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

export function HomeView({ state, soundEnabled, onToggleSound, ...handlers }: HomeViewProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <ScreenContainer insetTop>
      <View style={styles.topBar}>
        <SoundToggleButton enabled={soundEnabled} onToggle={onToggleSound} />
      </View>
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
    // The sound switch, at the top right of the page; it overlaps the hero's top padding.
    topBar: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: -spacing.md,
      marginBottom: -spacing.lg,
      marginRight: -spacing.sm - 4,
      zIndex: 1,
    },
    hero: { gap: spacing.xs },
    streak: { flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", gap: spacing.md },
    streakNumber: { fontSize: 64, lineHeight: 70 },
    // Sits on the number's baseline.
    streakUnit: { flexShrink: 1, paddingBottom: 10 },
    emptyReview: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
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
    topic: { gap: 0 },
    topicTab: { marginBottom: spacing.xs },
    lesson: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    pressed: { backgroundColor: colors.rule },
    lessonTitle: { flexShrink: 1 },
    // Dotted leader between the title and its status, as in a table of contents.
    leader: {
      flex: 1,
      minWidth: spacing.md,
      alignSelf: "center",
      marginTop: 8,
      borderBottomWidth: 2,
      borderStyle: "dotted",
      borderColor: colors.textMuted,
      opacity: 0.5,
    },
    pendingMark: { width: 24, textAlign: "center" },
    doneMark: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    footer: {
      marginTop: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.rule,
    },
    level: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: spacing.md },
  }),
);
