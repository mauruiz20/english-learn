import type { DailyGoalStatus } from "@english-learn/domain";
import type { DialogueCharacter, DialogueRating, Level } from "@english-learn/content";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { GlossaryText } from "@/features/glossary/glossary-text";
import {
  SavingScreen,
  SessionMessage,
  SessionSummary,
  type EarnedSticker,
} from "@/features/lesson/components/session-screens";
import type { ReviewNote } from "@/features/lesson/model/items-to-review";
import type { RecapItem } from "@/features/lesson/model/lesson-recap";
import type { LessonScore } from "@/features/lesson/model/lesson-score";
import { SpeakButton } from "@/features/pronunciation/speak-button";
import { WithSpeaker } from "@/features/pronunciation/with-speaker";
import { levelHighlighter } from "@/features/topics/topic-colors";
import { Button } from "@/shared/ui/button";
import { PressableScale } from "@/shared/ui/pressable-scale";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { RULED_LINE_HEIGHT, TOUCH_TARGET, fonts, radius, spacing } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { dialogueScoreDescription, dialogueScoreText } from "./model/dialogue-catalog";
import type { DialogueFeedback, TranscriptLine } from "./model/dialogue-runner";

/** The learner's reply area: replies to choose, or a Spanish prompt to say in English. */
export type ChatTurn =
  | { readonly kind: "choose"; readonly options: readonly string[] }
  | { readonly kind: "write"; readonly prompt: string };

export type DialogueViewState =
  | { readonly status: "not-found" }
  | {
      readonly status: "intro";
      readonly title: string;
      readonly level: Level;
      readonly setting: string;
      readonly characters: readonly DialogueCharacter[];
      /** The "read aloud" switch; absent without pronunciation. */
      readonly autoSpeak?: boolean;
    }
  | {
      readonly status: "chat";
      readonly title: string;
      /** 1-based number of the reply being asked or just given. */
      readonly position: number;
      readonly total: number;
      readonly transcript: readonly TranscriptLine[];
      /** The reply asked now (null while feedback shows). */
      readonly turn: ChatTurn | null;
      readonly feedback: DialogueFeedback | null;
    }
  | { readonly status: "saving" }
  | { readonly status: "save-error" }
  | {
      readonly status: "summary";
      readonly title: string;
      /** Spanish: how the conversation ended. */
      readonly ending: string;
      readonly good: number;
      readonly total: number;
      readonly xpEarned: number;
      readonly streakDays: number;
      readonly streakIncreased?: boolean;
      /** The best result so far (this one included); none if it could not be read. */
      readonly best?: LessonScore | undefined;
      /** Today's count against the daily goal (absent: unknown). */
      readonly dailyGoal?: DailyGoalStatus | undefined;
      readonly toReview: readonly ReviewNote[];
      readonly recap: readonly RecapItem[];
      readonly achievements?: readonly EarnedSticker[];
      readonly doneLabel: string;
    };

export type DialogueViewProps = {
  state: DialogueViewState;
  onBegin: () => void;
  onAutoSpeakChange: (on: boolean) => void;
  onChoose: (en: string) => void;
  onWrite: (text: string) => void;
  onContinue: () => void;
  onRetrySave: () => void;
  onDone: () => void;
  onRedo: () => void;
  onOpenCard?: ((cardId: string) => void) | undefined;
};

const NAME = "Diálogo";

/** The band's headline per rating (the text explains why). */
export const RATING_TITLES: Readonly<Record<DialogueRating, string>> = {
  good: "¡Bien dicho!",
  ok: "Se puede mejorar",
  wrong: "No del todo",
};

const BAND: Readonly<Record<DialogueRating, "correct" | "almost" | "wrong">> = {
  good: "correct",
  ok: "almost",
  wrong: "wrong",
};

/**
 * `/dialogo/[id]`: a conversation as a chat on notebook paper. The other character's lines are
 * paper slips on the left (name, English with word lookup and a speaker, Spanish on demand); the
 * learner's replies are stickers on the right, tinted by how they sounded. The reply area asks
 * for a choice or a written reply; after it, the footer band explains it ("Mejor: …").
 */
export function DialogueView(props: DialogueViewProps) {
  const { state } = props;
  switch (state.status) {
    case "not-found":
      return (
        <SessionMessage title={NAME} text="No encontramos este diálogo." onGoHome={props.onDone} />
      );
    case "save-error":
      return (
        <SessionMessage
          title={NAME}
          text="No pudimos guardar tu progreso."
          onRetry={props.onRetrySave}
          onGoHome={props.onDone}
        />
      );
    case "saving":
      return <SavingScreen title={NAME} label="Guardando tu progreso" />;
    case "intro":
      return <Intro {...props} state={state} />;
    case "chat":
      return <Chat {...props} state={state} />;
    case "summary":
      return (
        <SessionSummary
          title="¡Diálogo completado!"
          correct={state.good}
          total={state.total}
          correctLabel={`Respuestas buenas: ${state.good} de ${state.total}`}
          xpEarned={state.xpEarned}
          streakDays={state.streakDays}
          streakIncreased={state.streakIncreased ?? false}
          toReview={state.toReview}
          topic="dialogues"
          achievements={state.achievements}
          doneLabel={state.doneLabel}
          onGoHome={props.onDone}
          recap={state.recap}
          onOpenCard={props.onOpenCard}
          onRedo={props.onRedo}
          redoLabel="Repetir diálogo"
          redoNoun="el diálogo"
          header={<Ending ending={state.ending} best={state.best} />}
          dailyGoal={state.dailyGoal}
        />
      );
  }
}

function Intro({
  state,
  onBegin,
  onAutoSpeakChange,
}: DialogueViewProps & { state: Extract<DialogueViewState, { status: "intro" }> }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <ScreenContainer title={state.title}>
      <View style={styles.introCard}>
        <View
          style={[
            styles.levelChip,
            { backgroundColor: colors.highlighters[levelHighlighter(state.level)] },
          ]}
        >
          <Text variant="smallStrong" style={{ color: colors.onHighlighter }}>
            {`Nivel ${state.level}`}
          </Text>
        </View>
        <Text>{state.setting}</Text>
        <Text variant="smallStrong" tone="muted">
          Con quién hablas
        </Text>
        {state.characters.map((c) => (
          <Text key={c.id}>{`${c.name}, ${c.role}`}</Text>
        ))}
      </View>
      <Text tone="muted">
        Elige o escribe tus respuestas. Lo que digas cambia cómo te responden.
      </Text>
      {state.autoSpeak !== undefined && (
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Leer en voz alta lo que dicen"
          accessibilityState={{ checked: state.autoSpeak }}
          // react-native-web drops `checked` for a switch: the web reads it from here.
          aria-checked={state.autoSpeak}
          onPress={() => onAutoSpeakChange(!state.autoSpeak)}
          style={styles.switchRow}
        >
          <Text style={styles.switchText}>Leer en voz alta lo que dicen</Text>
          <View style={[styles.track, state.autoSpeak && styles.trackOn]}>
            <View style={[styles.knob, state.autoSpeak ? styles.knobOn : styles.knobOff]} />
          </View>
        </Pressable>
      )}
      <Button label="Empezar" onPress={onBegin} />
    </ScreenContainer>
  );
}

function Chat({
  state,
  onChoose,
  onWrite,
  onContinue,
}: DialogueViewProps & { state: Extract<DialogueViewState, { status: "chat" }> }) {
  const styles = useStyles();
  const { feedback } = state;
  return (
    <ScreenContainer
      followEnd
      top={
        <Text variant="smallStrong" tone="muted">
          {`Respuesta ${state.position} de ${state.total}`}
        </Text>
      }
      title={state.title}
      {...(feedback === null
        ? {}
        : {
            footerTone: BAND[feedback.rating],
            footer: <FeedbackBand feedback={feedback} onContinue={onContinue} />,
          })}
    >
      <View style={styles.chat}>
        {state.transcript.map((line) =>
          line.kind === "npc" ? (
            <NpcBubble key={line.nodeId} line={line} />
          ) : (
            <LearnerBubble key={`${line.nodeId}-reply`} line={line} />
          ),
        )}
      </View>
      {state.turn?.kind === "choose" && (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Elige tu respuesta"
          style={styles.replies}
        >
          <Text variant="smallStrong" tone="muted">
            Elige tu respuesta
          </Text>
          {state.turn.options.map((en) => (
            <ReplyButton key={en} text={en} onPress={() => onChoose(en)} />
          ))}
        </View>
      )}
      {state.turn?.kind === "write" && (
        <WriteReply key={`write-${state.position}`} prompt={state.turn.prompt} onWrite={onWrite} />
      )}
    </ScreenContainer>
  );
}

function NpcBubble({ line }: { line: Extract<TranscriptLine, { kind: "npc" }> }) {
  const styles = useStyles();
  const [spanish, setSpanish] = useState(false);
  return (
    <View testID={`npc-line-${line.nodeId}`} style={[styles.bubble, styles.npc]}>
      <Text variant="smallStrong" tone="ink">
        {line.speaker.name}
      </Text>
      <WithSpeaker text={line.en}>
        <GlossaryText text={line.en} enabled />
      </WithSpeaker>
      {spanish && (
        <Text variant="small" tone="muted">
          {line.es}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={spanish ? "Ocultar el español" : "Ver en español"}
        onPress={() => setSpanish((on) => !on)}
        hitSlop={8}
        style={styles.glossToggle}
      >
        <Text variant="small" tone="ink" style={styles.link}>
          {spanish ? "Ocultar el español" : "Ver en español"}
        </Text>
      </Pressable>
    </View>
  );
}

function LearnerBubble({ line }: { line: Extract<TranscriptLine, { kind: "learner" }> }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const band = colors.feedback[BAND[line.rating]];
  return (
    <View
      testID={`learner-line-${line.nodeId}`}
      accessibilityLabel={`Tú: ${line.text}`}
      style={[styles.bubble, styles.learner, { backgroundColor: band.tint, borderColor: band.ink }]}
    >
      <Text variant="smallStrong" style={{ color: band.ink }}>
        Tú
      </Text>
      <Text>{line.text}</Text>
    </View>
  );
}

function ReplyButton({ text, onPress }: { text: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Responder: ${text}`}
      onPress={onPress}
      style={({ pressed }) => [styles.reply, pressed && styles.replyPressed]}
    >
      <Text>{text}</Text>
    </PressableScale>
  );
}

function WriteReply({ prompt, onWrite }: { prompt: string; onWrite: (text: string) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [text, setText] = useState("");
  const canSend = text.trim().length > 0;
  const send = () => canSend && onWrite(text);
  return (
    <View style={styles.replies}>
      <Text variant="smallStrong" tone="muted">
        Escribe tu respuesta en inglés
      </Text>
      <Text variant="bodyStrong">{prompt}</Text>
      <TextInput
        accessibilityLabel="Tu respuesta en inglés"
        placeholder="Escribe en inglés"
        placeholderTextColor={colors.textMuted}
        value={text}
        onChangeText={setText}
        onSubmitEditing={send}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        returnKeyType="send"
        style={styles.input}
      />
      <Button label="Responder" onPress={send} disabled={!canSend} />
    </View>
  );
}

function FeedbackBand({
  feedback,
  onContinue,
}: {
  feedback: DialogueFeedback;
  onContinue: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const band = colors.feedback[BAND[feedback.rating]];
  const title = RATING_TITLES[feedback.rating];
  const spoken = [
    `${title}.`,
    feedback.text,
    feedback.better === undefined ? "" : `Mejor: ${feedback.better}`,
    feedback.tip ?? "",
  ]
    .filter((part) => part !== "")
    .join(" ");
  return (
    <View style={styles.band}>
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLabel={spoken}
        style={styles.bandText}
      >
        <Text variant="title" style={{ color: band.ink }}>
          {title}
        </Text>
        <Text>{feedback.text}</Text>
        {feedback.better !== undefined && (
          <View style={styles.better}>
            <Text style={styles.betterText}>
              <Text variant="bodyStrong">Mejor: </Text>
              {feedback.better}
            </Text>
            <SpeakButton text={feedback.better} />
          </View>
        )}
        {feedback.tip !== undefined && (
          <Text variant="small" tone="muted">
            {feedback.tip}
          </Text>
        )}
      </View>
      <Button label="Continuar" onPress={onContinue} />
    </View>
  );
}

/** How the conversation ended and the best result, under the summary's sticker. */
function Ending({ ending, best }: { ending: string; best: LessonScore | undefined }) {
  const styles = useStyles();
  return (
    <View style={styles.ending}>
      <Text>{ending}</Text>
      {best !== undefined && (
        <View
          accessible
          accessibilityLabel={`Tu mejor resultado: ${dialogueScoreDescription(best)}`}
          style={styles.best}
        >
          <Text variant="small" tone="muted">
            Tu mejor resultado
          </Text>
          <Text variant="bodyStrong" tone="success">
            {dialogueScoreText(best)}
          </Text>
        </View>
      )}
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    introCard: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.sheet,
      boxShadow: `0 3px 0 ${colors.rule}`,
    },
    levelChip: {
      alignSelf: "flex-start",
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 1,
    },
    switchRow: {
      minHeight: TOUCH_TARGET,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    switchText: { flex: 1 },
    track: {
      width: 44,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: colors.ink,
      justifyContent: "center",
    },
    trackOn: { backgroundColor: colors.ink },
    knob: { width: 16, height: 16, borderRadius: 8, position: "absolute" },
    knobOn: { right: 3, backgroundColor: colors.onInk },
    knobOff: { left: 3, backgroundColor: colors.ink },
    chat: { gap: spacing.md },
    bubble: {
      maxWidth: "88%",
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderWidth: 1.5,
    },
    // A paper slip, square at its top left like a speech bubble's tail.
    npc: {
      alignSelf: "flex-start",
      backgroundColor: colors.sheet,
      borderColor: colors.rule,
      borderRadius: radius.lg,
      borderTopLeftRadius: radius.sm,
      boxShadow: `0 3px 0 ${colors.rule}`,
    },
    // The learner's sticker, square at its top right.
    learner: {
      alignSelf: "flex-end",
      borderRadius: radius.lg,
      borderTopRightRadius: radius.sm,
    },
    glossToggle: { alignSelf: "flex-start", minHeight: 24, justifyContent: "center" },
    link: { textDecorationLine: "underline" },
    replies: { gap: spacing.sm },
    reply: {
      minHeight: TOUCH_TARGET,
      justifyContent: "center",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      borderTopRightRadius: radius.sm,
      borderWidth: 2,
      borderColor: colors.ink,
      backgroundColor: colors.sheet,
      alignSelf: "flex-end",
      maxWidth: "92%",
    },
    replyPressed: { backgroundColor: colors.rule },
    input: {
      minHeight: RULED_LINE_HEIGHT + spacing.md,
      paddingHorizontal: spacing.xs,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
      fontFamily: fonts.body,
      fontSize: 20,
      color: colors.ink,
      borderBottomWidth: 2,
      borderBottomColor: colors.ink,
    },
    band: { gap: spacing.md },
    bandText: { gap: spacing.xs },
    better: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    betterText: { flex: 1 },
    ending: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.sheet,
      boxShadow: `0 3px 0 ${colors.rule}`,
    },
    best: { gap: 2 },
  }),
);
