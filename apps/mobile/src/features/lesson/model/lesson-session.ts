import type { Exercise, Lesson } from "@english-learn/content";
import { accuracy, xpForAnswer, type Verdict } from "@english-learn/domain";
import { gradeExercise, type GradeResult } from "./grade-exercise";
import type { ExerciseResponse } from "./response";

export type ItemOutcome = {
  readonly itemId: string;
  readonly exerciseType: Exercise["type"];
  readonly verdict: Verdict;
  readonly responseMs: number;
  /**
   * The learner looked the item's word up in the glossary before answering this exercise. Its
   * review grade is capped at "almost" (see `finalGrades`); the verdict shown and the XP
   * are unchanged.
   */
  readonly lookedUp?: boolean;
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
};

type Answered = {
  readonly verdict: Verdict;
  readonly responseMs: number;
  /** Items of the exercise the learner had looked up before answering it. */
  readonly lookedUp: readonly string[];
};

/** What the session runs: a lesson, or e.g. a review with a synthetic id and title. */
export type SessionInfo = Pick<Lesson, "id" | "title">;

type InProgress = {
  readonly lesson: SessionInfo;
  readonly exercises: readonly Exercise[];
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
  /** The learner looked up a word that matches these items (any time before the session ends). */
  | { readonly type: "lookup"; readonly itemIds: readonly string[] };

export function startLesson(
  lesson: SessionInfo,
  exercises: readonly Exercise[],
): LessonSessionState {
  if (exercises.length === 0) throw new RangeError(`Lesson ${lesson.id} has no exercises`);
  return { status: "answering", lesson, exercises, index: 0, answered: [], lookedUp: [] };
}

/** The exercise being answered or reviewed, or null once the lesson is finished. */
export function currentExercise(state: LessonSessionState): Exercise | null {
  return state.status === "finished" ? null : (state.exercises[state.index] ?? null);
}

function summarize({ lesson, exercises, answered }: Omit<InProgress, "lookedUp">): LessonSummary {
  const verdicts = answered.map((a) => a.verdict);
  const ratio = accuracy(verdicts);
  const answerXp = verdicts.reduce((sum, v) => sum + xpForAnswer(v), 0);
  const itemOutcomes = exercises.flatMap((exercise, i) => {
    const { verdict, responseMs, lookedUp } = answered[i] ?? {
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
    }));
  });
  return { lessonId: lesson.id, verdicts, accuracy: ratio, answerXp, itemOutcomes };
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
  if (state.status !== "feedback") return state;
  const { lesson, exercises, answered, lookedUp } = state;
  const index = state.index + 1;
  if (index >= exercises.length) {
    return { status: "finished", summary: summarize({ lesson, exercises, index, answered }) };
  }
  return { status: "answering", lesson, exercises, index, answered, lookedUp };
}
