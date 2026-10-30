import type { Exercise, Lesson } from "@english-learn/content";
import { accuracy, xpForAnswer, type Verdict } from "@english-learn/domain";
import { gradeExercise, type GradeResult } from "./grade-exercise";
import type { ExerciseResponse } from "./response";

export type ItemOutcome = {
  readonly itemId: string;
  readonly exerciseType: Exercise["type"];
  readonly verdict: Verdict;
  readonly responseMs: number;
};

export type LessonSummary = {
  readonly lessonId: string;
  /** One verdict per exercise, in lesson order. */
  readonly verdicts: readonly Verdict[];
  /** Share of fully correct exercises (0..1). */
  readonly accuracy: number;
  /**
   * Sum of `xpForAnswer`. Any completion bonus is decided when the results are saved, because
   * it depends on stored progress (a replayed lesson gets none).
   */
  readonly answerXp: number;
  /** One outcome per item of every exercise (an item may appear several times). */
  readonly itemOutcomes: readonly ItemOutcome[];
};

type Answered = { readonly verdict: Verdict; readonly responseMs: number };

/** What the session runs: a lesson, or e.g. a review with a synthetic id and title. */
export type SessionInfo = Pick<Lesson, "id" | "title">;

type InProgress = {
  readonly lesson: SessionInfo;
  readonly exercises: readonly Exercise[];
  readonly index: number;
  readonly answered: readonly Answered[];
};

export type LessonSessionState =
  | ({ readonly status: "answering" } & InProgress)
  | ({ readonly status: "feedback"; readonly feedback: GradeResult } & InProgress)
  | { readonly status: "finished"; readonly summary: LessonSummary };

export type LessonSessionAction =
  | { readonly type: "answer"; readonly response: ExerciseResponse; readonly responseMs: number }
  | { readonly type: "next" };

export function startLesson(
  lesson: SessionInfo,
  exercises: readonly Exercise[],
): LessonSessionState {
  if (exercises.length === 0) throw new RangeError(`Lesson ${lesson.id} has no exercises`);
  return { status: "answering", lesson, exercises, index: 0, answered: [] };
}

/** The exercise being answered or reviewed, or null once the lesson is finished. */
export function currentExercise(state: LessonSessionState): Exercise | null {
  return state.status === "finished" ? null : (state.exercises[state.index] ?? null);
}

function summarize({ lesson, exercises, answered }: InProgress): LessonSummary {
  const verdicts = answered.map((a) => a.verdict);
  const ratio = accuracy(verdicts);
  const answerXp = verdicts.reduce((sum, v) => sum + xpForAnswer(v), 0);
  const itemOutcomes = exercises.flatMap((exercise, i) => {
    const { verdict, responseMs } = answered[i] ?? { verdict: "wrong", responseMs: 0 };
    return exercise.itemIds.map((itemId) => ({
      itemId,
      exerciseType: exercise.type,
      verdict,
      responseMs,
    }));
  });
  return { lessonId: lesson.id, verdicts, accuracy: ratio, answerXp, itemOutcomes };
}

/** Pure lesson flow: answering → feedback → (next exercise | finished). Invalid actions are ignored. */
export function lessonSessionReducer(
  state: LessonSessionState,
  action: LessonSessionAction,
): LessonSessionState {
  if (action.type === "answer") {
    if (state.status !== "answering") return state;
    const exercise = state.exercises[state.index];
    if (exercise === undefined) return state;
    const feedback = gradeExercise(exercise, action.response);
    return {
      ...state,
      status: "feedback",
      feedback,
      answered: [...state.answered, { verdict: feedback.verdict, responseMs: action.responseMs }],
    };
  }
  if (state.status !== "feedback") return state;
  const { lesson, exercises, answered } = state;
  const index = state.index + 1;
  if (index >= exercises.length) {
    return { status: "finished", summary: summarize({ lesson, exercises, index, answered }) };
  }
  return { status: "answering", lesson, exercises, index, answered };
}
