import type { Verdict } from "@english-learn/domain";
import type { Passage } from "@english-learn/content";
import { PageTurn } from "@/shared/ui/page-turn";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { AnswerFeedback } from "./components/answer-feedback";
import { ExerciseBody } from "./components/exercise-body";
import {
  SavingScreen,
  SessionMessage,
  SessionProgress,
  SessionSummary,
} from "./components/session-screens";
import type { GradeResult } from "./model/grade-exercise";
import { answerIsEnglish } from "./model/lookup-policy";
import type { ReviewNote } from "./model/items-to-review";
import type { PreparedExercise } from "./model/prepare-exercise";
import type { ExerciseResponse } from "./model/response";
import { correctInARow } from "./model/session-results";
import type { EarnedSticker } from "./components/session-screens";

/** A study card that explains an exercise ("Ver ficha" after a wrong or almost answer). */
export type ExerciseCard = { readonly id: string; readonly title: string };

/** What the screen calls the session: a lesson, or the practice of a study card. */
export type SessionCopy = {
  /** Screen title while loading, saving or failing ("Lección"). */
  readonly name: string;
  readonly notFound: string;
  /** The summary's title ("¡Lección completada!"). */
  readonly completed: string;
  /** The summary's button ("Volver al inicio"). */
  readonly done: string;
};

export const LESSON_COPY: SessionCopy = {
  name: "Lección",
  notFound: "No encontramos esta lección.",
  completed: "¡Lección completada!",
  done: "Volver al inicio",
};

/** Feedback on the current answer, with the learner's answer as text. */
export type ShownFeedback = GradeResult & {
  readonly given: string;
  /** The learner may mark the answer as correct (see `canDispute`). */
  readonly disputable: boolean;
};

export type LessonViewState =
  | { readonly status: "not-found" }
  | {
      readonly status: "exercise";
      readonly title: string;
      /** The lesson's topic slug (its highlighter tints the progress line and the title). */
      readonly topic: string | undefined;
      /** 1-based position of the current exercise. */
      readonly position: number;
      readonly total: number;
      readonly prepared: PreparedExercise;
      /** The passage of a reading exercise. */
      readonly passage: Passage | undefined;
      /** Set once the learner answered the current exercise. */
      readonly feedback: ShownFeedback | null;
      /** Verdicts of the exercises answered so far, in order (the shown answer included). */
      readonly results?: readonly Verdict[];
      /** The study card that explains this exercise, if any. */
      readonly card?: ExerciseCard | undefined;
    }
  | { readonly status: "saving" }
  | { readonly status: "save-error" }
  | {
      readonly status: "summary";
      readonly correct: number;
      readonly total: number;
      readonly xpEarned: number;
      readonly streakDays: number;
      /** This session extended the streak (the summary rolls the number). */
      readonly streakIncreased?: boolean;
      /** Items missed in the session, to look at again. */
      readonly toReview: readonly ReviewNote[];
      /** Album stickers the session earned. */
      readonly achievements?: readonly EarnedSticker[];
      /** The lesson's topic (the color of the sticker it earns). */
      readonly topic?: string | undefined;
    };

type LessonViewProps = {
  state: LessonViewState;
  onSubmit: (response: ExerciseResponse) => void;
  onContinue: () => void;
  onDispute: () => void;
  onGoHome: () => void;
  onRetrySave: () => void;
  /** Opens a study card on top of the session ("Ver ficha"). */
  onOpenCard?: ((cardId: string) => void) | undefined;
  copy?: SessionCopy;
};

export function LessonView({
  state,
  onSubmit,
  onContinue,
  onDispute,
  onGoHome,
  onRetrySave,
  onOpenCard,
  copy = LESSON_COPY,
}: LessonViewProps) {
  switch (state.status) {
    case "not-found":
      return <SessionMessage title={copy.name} text={copy.notFound} onGoHome={onGoHome} />;
    case "save-error":
      return (
        <SessionMessage
          title={copy.name}
          text="No pudimos guardar tu progreso."
          onRetry={onRetrySave}
          onGoHome={onGoHome}
        />
      );
    case "saving":
      return <SavingScreen title={copy.name} label="Guardando tu progreso" />;
    case "summary":
      return (
        <SessionSummary
          title={copy.completed}
          doneLabel={copy.done}
          {...state}
          onGoHome={onGoHome}
        />
      );
    case "exercise":
      return (
        <ScreenContainer
          top={
            <SessionProgress
              position={state.position}
              total={state.total}
              title={state.title}
              topic={state.topic}
              results={state.results}
            />
          }
          {...(state.feedback === null
            ? {}
            : {
                footerTone: state.feedback.verdict,
                footer: (
                  <AnswerFeedback
                    verdict={state.feedback.verdict}
                    given={state.feedback.given}
                    correctAnswer={state.feedback.correctAnswer}
                    diff={state.feedback.diff}
                    hint={state.feedback.hint}
                    lookupAnswer={answerIsEnglish(state.prepared)}
                    disputed={state.feedback.disputed}
                    onDispute={state.feedback.disputable ? onDispute : undefined}
                    inARow={correctInARow(state.results ?? [])}
                    card={cardLink(state.card, onOpenCard)}
                    onContinue={onContinue}
                  />
                ),
              })}
        >
          <PageTurn pageKey={state.prepared.exercise.id}>
            <ExerciseBody
              key={state.prepared.exercise.id}
              prepared={state.prepared}
              passage={state.passage}
              disabled={state.feedback !== null}
              reveal={state.feedback !== null}
              onSubmit={onSubmit}
            />
          </PageTurn>
        </ScreenContainer>
      );
  }
}

/** The "Ver ficha" link of the feedback, when the exercise has a card and it can be opened. */
export function cardLink(
  card: ExerciseCard | undefined,
  onOpenCard: ((cardId: string) => void) | undefined,
): { title: string; onOpen: () => void } | undefined {
  if (card === undefined || onOpenCard === undefined) return undefined;
  return { title: card.title, onOpen: () => onOpenCard(card.id) };
}
