import type { Lesson } from "@english-learn/content";
import { accuracy, xpForAnswer, type Verdict } from "@english-learn/domain";
import { gradeExercise, type GradeResult } from "./grade-exercise";
import type { SessionExercise } from "./listen-exercise";
import type { ExerciseResponse } from "./response";

export type ItemOutcome = {
  readonly itemId: string;
  readonly exerciseType: SessionExercise["type"];
  readonly verdict: Verdict;
  readonly responseMs: number;
  /**
   * The learner looked the item's word up in the glossary before answering this exercise. Its
   * review grade is capped at "almost" (see `finalGrades`); the verdict shown and the XP
   * are unchanged.
   */
  readonly lookedUp?: boolean;
  /**
   * The learner marked this translate_write answer as correct after it was graded wrong or
   * almost: `verdict` is "correct" and its review grade is 4 (see `finalGrades`).
   */
  readonly disputed?: boolean;
};

/** A translate_write answer the learner marked as correct (written as `answer_disputed`). */
export type DisputedAnswer = {
  readonly exerciseId: string;
  readonly itemIds: readonly string[];
  /** The answer as typed, trimmed. */
  readonly answer: string;
};

export type LessonSummary = {
  readonly lessonId: string;
  /** One verdict per exercise, in lesson order. */
  readonly verdicts: readonly Verdict[];
  /** Share of fully correct exercises (0..1). */
  readonly accuracy: number;
  /**
   * Sum of `xpForAnswer`. Any completion bonus is decided by the fold of the event log when the
   * results are saved (only a lesson's first completion gets it).
   */
  readonly answerXp: number;
  /** One outcome per item of every exercise (an item may appear several times). */
  readonly itemOutcomes: readonly ItemOutcome[];
  /** Answers the learner marked as correct, in lesson order (absent: none). */
  readonly disputes?: readonly DisputedAnswer[];
};

type Answered = {
  readonly verdict: Verdict;
  readonly responseMs: number;
  /** Items of the exercise the learner had looked up before answering it. */
  readonly lookedUp: readonly string[];
  /** Set when the learner marked the answer as correct: what they typed, trimmed. */
  readonly disputedAnswer?: string;
};

/** What the session runs: a lesson, or e.g. a review with a synthetic id and title. */
export type SessionInfo = Pick<Lesson, "id" | "title">;

type InProgress = {
  readonly lesson: SessionInfo;
  readonly exercises: readonly SessionExercise[];
  readonly index: number;
  readonly answered: readonly Answered[];
  /** Items whose word the learner looked up so far in the session, in lookup order. */
  readonly lookedUp: readonly string[];
};

export type LessonSessionState =
  | ({ readonly status: "answering" } & InProgress)
  | ({
      readonly status: "feedback";
      readonly feedback: GradeResult;
      /** What the learner answered, shown back with the feedback. */
      readonly response: ExerciseResponse;
    } & InProgress)
  | { readonly status: "finished"; readonly summary: LessonSummary };

export type LessonSessionAction =
  | { readonly type: "answer"; readonly response: ExerciseResponse; readonly responseMs: number }
  | { readonly type: "next" }
  /** "Mi respuesta también es correcta": regrade the shown translate_write answer as correct. */
  | { readonly type: "dispute" }
  /** The learner looked up a word that matches these items (any time before the session ends). */
  | { readonly type: "lookup"; readonly itemIds: readonly string[] };

export function startLesson(
  lesson: SessionInfo,
  exercises: readonly SessionExercise[],
): LessonSessionState {
  if (exercises.length === 0) throw new RangeError(`Lesson ${lesson.id} has no exercises`);
  return { status: "answering", lesson, exercises, index: 0, answered: [], lookedUp: [] };
}

/** The exercise being answered or reviewed, or null once the lesson is finished. */
export function currentExercise(state: LessonSessionState): SessionExercise | null {
  return state.status === "finished" ? null : (state.exercises[state.index] ?? null);
}

function summarize({ lesson, exercises, answered }: Omit<InProgress, "lookedUp">): LessonSummary {
  const verdicts = answered.map((a) => a.verdict);
  const ratio = accuracy(verdicts);
  const answerXp = verdicts.reduce((sum, v) => sum + xpForAnswer(v), 0);
  const itemOutcomes = exercises.flatMap((exercise, i) => {
    const { verdict, responseMs, lookedUp, disputedAnswer } = answered[i] ?? {
      verdict: "wrong",
      responseMs: 0,
      lookedUp: [],
    };
    return exercise.itemIds.map((itemId) => ({
      itemId,
      exerciseType: exercise.type,
      verdict,
      responseMs,
      ...(lookedUp.includes(itemId) ? { lookedUp: true } : {}),
      ...(disputedAnswer === undefined ? {} : { disputed: true }),
    }));
  });
  const disputes = exercises.flatMap((exercise, i) => {
    const answer = answered[i]?.disputedAnswer;
    return answer === undefined
      ? []
      : [{ exerciseId: exercise.id, itemIds: exercise.itemIds, answer }];
  });
  return { lessonId: lesson.id, verdicts, accuracy: ratio, answerXp, itemOutcomes, disputes };
}

/**
 * The shown answer can be marked as correct: a translate_write answer graded wrong or almost,
 * not already marked.
 */
export function canDispute(state: LessonSessionState): boolean {
  return (
    state.status === "feedback" &&
    state.exercises[state.index]?.type === "translate_write" &&
    state.response.kind === "text" &&
    state.feedback.verdict !== "correct" &&
    state.feedback.disputed !== true
  );
}

/** Pure lesson flow: answering → feedback → (next exercise | finished). Invalid actions are ignored. */
export function lessonSessionReducer(
  state: LessonSessionState,
  action: LessonSessionAction,
): LessonSessionState {
  if (action.type === "lookup") {
    if (state.status === "finished") return state;
    const added = action.itemIds.filter((id) => !state.lookedUp.includes(id));
    return added.length === 0 ? state : { ...state, lookedUp: [...state.lookedUp, ...added] };
  }
  if (action.type === "answer") {
    if (state.status !== "answering") return state;
    const exercise = state.exercises[state.index];
    if (exercise === undefined) return state;
    const feedback = gradeExercise(exercise, action.response);
    return {
      ...state,
      status: "feedback",
      feedback,
      response: action.response,
      answered: [
        ...state.answered,
        {
          verdict: feedback.verdict,
          responseMs: action.responseMs,
          lookedUp: exercise.itemIds.filter((id) => state.lookedUp.includes(id)),
        },
      ],
    };
  }
  if (action.type === "dispute") {
    if (!canDispute(state) || state.status !== "feedback" || state.response.kind !== "text") {
      return state;
    }
    const last = state.answered[state.answered.length - 1];
    if (last === undefined) return state;
    return {
      ...state,
      feedback: { ...state.feedback, verdict: "correct", disputed: true },
      answered: [
        ...state.answered.slice(0, -1),
        { ...last, verdict: "correct", disputedAnswer: state.response.text.trim() },
      ],
    };
  }
  if (state.status !== "feedback") return state;
  const { lesson, exercises, answered, lookedUp } = state;
  const index = state.index + 1;
  if (index >= exercises.length) {
    return { status: "finished", summary: summarize({ lesson, exercises, index, answered }) };
  }
  return { status: "answering", lesson, exercises, index, answered, lookedUp };
}
