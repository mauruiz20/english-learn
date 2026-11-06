import type { Corpus, Dialogue } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { Stack, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useNewAchievements } from "@/features/achievements/use-new-achievements";
import { cardPath } from "@/features/cards/card-routes";
import { SessionGlossary } from "@/features/glossary/session-glossary";
import { completeSession } from "@/features/lesson/application/complete-session";
import { itemsToReview } from "@/features/lesson/model/items-to-review";
import type { LessonScore } from "@/features/lesson/model/lesson-score";
import { useSessionSounds } from "@/features/lesson/use-session-sounds";
import { practiceCollectionPath } from "@/features/practice/practice-routes";
import { usePronunciation } from "@/features/pronunciation/pronunciation";
import { topicByItemId } from "@/features/topics/topic-colors";
import { useAppServices } from "@/infrastructure/services/app-services";
import { useLeaveConfirmation } from "@/shared/navigation/leave-confirmation";
import {
  dialogueSessionSummary,
  dialogueReducer,
  dialogueTurnCount,
  startDialogue,
  turnOptions,
  currentTurn,
  type DialogueAction,
  type DialogueRunState,
  type TranscriptLine,
} from "./model/dialogue-runner";
import { dialoguePlace, dialogueRecap, dialogueScore } from "./model/dialogue-catalog";
import { DialogueView, type DialogueViewState } from "./dialogue-view";

type SaveState =
  | { readonly status: "idle" | "saving" | "error" }
  | {
      readonly status: "saved";
      readonly xpEarned: number;
      readonly streakDays: number;
      readonly streakIncreased: boolean;
      readonly best: LessonScore | undefined;
    };

/** One key for the read-aloud voice (the speakers have their own). */
const AUTO_SPEAK_KEY = "dialogue-read-aloud";

/**
 * `/dialogo/[id]`: plays a dialogue (`DialogueRun`), then "Repetir diálogo" plays it again from
 * the intro as a new session (answer XP again, never a second completion bonus).
 */
export function DialogueContainer({
  dialogueId,
  content = corpus,
}: {
  dialogueId: string;
  content?: Corpus;
}) {
  const [attempt, setAttempt] = useState(0);
  const dialogue = content.dialoguesById.get(dialogueId);
  return (
    <DialogueRun
      key={attempt}
      dialogue={dialogue}
      content={content}
      onRedo={() => setAttempt((n) => n + 1)}
    />
  );
}

function DialogueRun({
  dialogue,
  content,
  onRedo,
}: {
  dialogue: Dialogue | undefined;
  content: Corpus;
  onRedo: () => void;
}) {
  const router = useRouter();
  const services = useAppServices();
  const { progressRepository, clock, random, randomBytes, deviceId } = services;
  const sounds = useSessionSounds();
  const pronunciation = usePronunciation();
  const [run, setRun] = useState<DialogueRunState | null>(() =>
    dialogue === undefined ? null : startDialogue(dialogue, random),
  );
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [autoSpeak, setAutoSpeak] = useState(false);
  const shownAt = useRef(clock.nowMs());
  const saving = useRef(false);

  const place = dialogue === undefined ? undefined : dialoguePlace(content, dialogue.id);
  const hasUnsavedAnswers = run !== null && run.status !== "finished" && run.answers.length > 0;
  const { dialog } = useLeaveConfirmation(hasUnsavedAnswers, "¿Salir del diálogo?");
  const achievements = useNewAchievements(save.status === "saved", content);
  const canLeave = save.status !== "saving";

  const persist = (state: Extract<DialogueRunState, { status: "finished" }>) => {
    if (saving.current) return;
    saving.current = true;
    setSave({ status: "saving" });
    const summary = dialogueSessionSummary(state);
    completeSession({
      repository: progressRepository,
      summary,
      today: clock.today(),
      nowMs: clock.nowMs(),
      randomBytes,
      deviceId,
      kind: "lesson",
    })
      .then(async ({ xpEarned, streak, streakIncreased }) => {
        // The best result, this session included (a failed read only hides the marker).
        const best = await progressRepository.getLessonResults().then(
          (results) =>
            dialogueScore(
              state.dialogue,
              results.find((r) => r.lessonId === state.dialogue.id),
            ),
          () => undefined,
        );
        setSave({ status: "saved", xpEarned, streakDays: streak.current, streakIncreased, best });
        sounds.completed(streakIncreased);
      })
      .catch((error: unknown) => {
        console.error("Failed to save the dialogue", error);
        saving.current = false;
        setSave({ status: "error" });
      });
  };

  /** Runs one action; called inside the learner's tap, so read-aloud may speak (iOS gestures). */
  const act = (action: DialogueAction) => {
    if (run === null) return;
    const next = dialogueReducer(run, action);
    if (next === run) return;
    setRun(next);
    if (next.status === "feedback" && run.status === "turn") {
      sounds.verdict(
        next.feedback.rating === "good"
          ? "correct"
          : next.feedback.rating === "ok"
            ? "almost"
            : "wrong",
      );
    }
    if (next.status === "turn" || next.status === "finished") shownAt.current = clock.nowMs();
    const said = next.transcript
      .slice(run.transcript.length)
      .filter((line): line is Extract<TranscriptLine, { kind: "npc" }> => line.kind === "npc");
    if (autoSpeak && said.length > 0) {
      pronunciation.speak(said.map((line) => line.en).join(" "), AUTO_SPEAK_KEY);
    }
    if (next.status === "finished") persist(next);
  };

  const responseMs = () => Math.max(0, clock.nowMs() - shownAt.current);

  const onDone = () => {
    if (router.canGoBack()) router.back();
    else router.replace(practiceCollectionPath(place?.slug ?? "dialogues"));
  };

  const state = toViewState(run, save, content, place?.collectionTitle, {
    autoSpeak: pronunciation.available ? autoSpeak : undefined,
    achievements,
  });

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: canLeave, headerBackVisible: canLeave }} />
      <SessionGlossary
        content={content}
        topic={undefined}
        onLookupItems={(itemIds) => {
          if (itemIds.length > 0)
            setRun((r) => (r === null ? r : dialogueReducer(r, { type: "lookup", itemIds })));
        }}
      >
        <DialogueView
          state={state}
          onBegin={() => act({ type: "begin" })}
          onAutoSpeakChange={setAutoSpeak}
          onChoose={(en) => act({ type: "choose", en, responseMs: responseMs() })}
          onWrite={(text) => act({ type: "write", text, responseMs: responseMs() })}
          onContinue={() => act({ type: "continue" })}
          onRetrySave={() => {
            if (run?.status === "finished") persist(run);
          }}
          onDone={onDone}
          onRedo={onRedo}
          onOpenCard={(cardId) => router.push(cardPath(cardId))}
        />
      </SessionGlossary>
      {dialog}
    </>
  );
}

function toViewState(
  run: DialogueRunState | null,
  save: SaveState,
  content: Corpus,
  collectionTitle: string | undefined,
  extra: {
    autoSpeak: boolean | undefined;
    achievements: ReturnType<typeof useNewAchievements>;
  },
): DialogueViewState {
  if (run === null) return { status: "not-found" };
  const { dialogue } = run;
  switch (run.status) {
    case "intro":
      return {
        status: "intro",
        title: dialogue.title,
        level: dialogue.level,
        setting: dialogue.setting,
        characters: dialogue.characters,
        ...(extra.autoSpeak === undefined ? {} : { autoSpeak: extra.autoSpeak }),
      };
    case "turn":
    case "feedback": {
      const turn = currentTurn(run);
      return {
        status: "chat",
        title: dialogue.title,
        position: run.answers.length + (run.status === "turn" ? 1 : 0),
        total: dialogueTurnCount(dialogue),
        transcript: run.transcript,
        turn:
          run.status === "feedback" || turn === undefined
            ? null
            : turn.kind === "choose"
              ? { kind: "choose", options: turnOptions(run, turn.id).map((o) => o.en) }
              : { kind: "write", prompt: turn.prompt },
        feedback: run.status === "feedback" ? run.feedback : null,
      };
    }
    case "finished": {
      if (save.status === "error") return { status: "save-error" };
      if (save.status !== "saved") return { status: "saving" };
      const summary = dialogueSessionSummary(run);
      return {
        status: "summary",
        title: dialogue.title,
        ending: run.end.text,
        good: run.result.good,
        total: run.result.total,
        xpEarned: save.xpEarned,
        streakDays: save.streakDays,
        streakIncreased: save.streakIncreased,
        best: save.best,
        toReview: itemsToReview(summary.itemOutcomes, content.itemsById, {
          topics: topicByItemId(content),
        }),
        recap: dialogueRecap(dialogue, content),
        ...(extra.achievements.length > 0 ? { achievements: extra.achievements } : {}),
        doneLabel: `Volver a ${collectionTitle ?? "Diálogos"}`,
      };
    }
  }
}
