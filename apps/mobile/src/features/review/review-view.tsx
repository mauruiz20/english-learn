import type { Verdict } from "@english-learn/domain";
import { ActivityIndicator } from "react-native";
import { AnswerFeedback } from "@/features/lesson/components/answer-feedback";
import { ExerciseBody } from "@/features/lesson/components/exercise-body";
import {
  SavingScreen,
  SessionMessage,
  SessionProgress,
  SessionSummary,
} from "@/features/lesson/components/session-screens";
import { cardLink, type ExerciseCard, type ShownFeedback } from "@/features/lesson/lesson-view";
import type { ReviewNote } from "@/features/lesson/model/items-to-review";
import { answerIsEnglish } from "@/features/lesson/model/lookup-policy";
import { spokenAnswer } from "@/features/lesson/model/spoken-answer";
import type { PreparedExercise } from "@/features/lesson/model/prepare-exercise";
import type { ExerciseResponse } from "@/features/lesson/model/response";
import { Button } from "@/shared/ui/button";
import { Doodle } from "@/shared/ui/doodle";
import { PageTurn } from "@/shared/ui/page-turn";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { useTheme } from "@/shared/ui/use-theme";
import { correctInARow } from "@/features/lesson/model/session-results";
import type { EarnedSticker } from "@/features/lesson/components/session-screens";

export type ReviewViewState =
  | { readonly status: "loading" }
  | { readonly status: "load-error" }
  | { readonly status: "empty" }
  | {
      readonly status: "exercise";
      /** 1-based position of the current exercise. */
      readonly position: number;
      readonly total: number;
      /** Topic of the lesson the current exercise comes from (named and colored above it). */
      readonly topic: string | undefined;
      readonly prepared: PreparedExercise;
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
      /** Exercises later reviews will serve today (absent: not known yet). */
      readonly remaining?: number;
      /** A line under the results instead of the remaining reviews (another session's words). */
      readonly note?: string;
    };

type ReviewViewProps = {
  state: ReviewViewState;
  onSubmit: (response: ExerciseResponse) => void;
  onContinue: () => void;
  onDispute: () => void;
  onGoHome: () => void;
  onRetrySave: () => void;
  /** Opens a study card on top of the review ("Ver ficha"). */
  onOpenCard?: ((cardId: string) => void) | undefined;
  /** The words of another session played like a review (the hard-words practice). */
  copy?: ReviewCopy;
};

/** What a review-like session calls itself. */
export type ReviewCopy = {
  readonly title: string;
  readonly loading: string;
  readonly loadError: string;
  readonly emptyTitle: string;
  readonly emptyText: string;
  readonly summaryTitle: string;
  readonly doneLabel?: string;
};

const REVIEW_COPY: ReviewCopy = {
  title: "Repaso",
  loading: "Cargando tu repaso",
  loadError: "No pudimos cargar tu repaso.",
  emptyTitle: "Nada para repasar hoy",
  emptyText: "Las palabras que aprendes en las lecciones vuelven aquí cuando toca repasarlas.",
  summaryTitle: "¡Repaso completado!",
};

/** "Te quedan 25 para otro repaso.": more were due than one review holds. */
function remainingText(remaining: number | undefined): string | undefined {
  if (remaining === undefined || remaining <= 0) return undefined;
  return remaining === 1
    ? "Te queda 1 para otro repaso."
    : `Te quedan ${remaining} para otro repaso.`;
}

export function ReviewView({
  state,
  onSubmit,
  onContinue,
  onDispute,
  onGoHome,
  onRetrySave,
  onOpenCard,
  copy = REVIEW_COPY,
}: ReviewViewProps) {
  const { colors } = useTheme();
  const TITLE = copy.title;
  switch (state.status) {
    case "loading":
      return (
        <ScreenContainer title={TITLE}>
          <ActivityIndicator accessibilityLabel={copy.loading} color={colors.ink} />
        </ScreenContainer>
      );
    case "load-error":
      return <SessionMessage title={TITLE} text={copy.loadError} onGoHome={onGoHome} />;
    case "empty":
      return (
        <ScreenContainer title={TITLE}>
          <Doodle name="rest" />
          <Text variant="title">{copy.emptyTitle}</Text>
          <Text tone="muted">{copy.emptyText}</Text>
          <Button label={copy.doneLabel ?? "Volver al inicio"} onPress={onGoHome} />
        </ScreenContainer>
      );
    case "saving":
      return <SavingScreen title={TITLE} label="Guardando tu progreso" />;
    case "save-error":
      return (
        <SessionMessage
          title={TITLE}
          text="No pudimos guardar tu progreso."
          onRetry={onRetrySave}
          onGoHome={onGoHome}
        />
      );
    case "summary":
      return (
        <SessionSummary
          title={copy.summaryTitle}
          {...state}
          {...(copy.doneLabel === undefined ? {} : { doneLabel: copy.doneLabel })}
          next={state.note ?? remainingText(state.remaining)}
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
                    disputed={state.feedback.disputed}
                    onDispute={state.feedback.disputable ? onDispute : undefined}
                    lookupAnswer={answerIsEnglish(state.prepared)}
                    speakText={spokenAnswer(state.prepared, state.feedback.correctAnswer)}
                    inARow={correctInARow(state.results ?? [])}
                    card={cardLink(state.card, onOpenCard)}
                    finishes={state.position === state.total}
                    onContinue={onContinue}
                  />
                ),
              })}
        >
          <PageTurn pageKey={state.prepared.exercise.id}>
            <ExerciseBody
              key={state.prepared.exercise.id}
              prepared={state.prepared}
              passage={undefined}
              disabled={state.feedback !== null}
              reveal={state.feedback !== null}
              onSubmit={onSubmit}
            />
          </PageTurn>
        </ScreenContainer>
      );
  }
}
