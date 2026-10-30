import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useAppServices } from "@/infrastructure/services/app-services";
import { completeLesson } from "./application/complete-lesson";
import { lessonExercises } from "./model/lesson-catalog";
import {
  lessonSessionReducer,
  startLesson,
  type LessonSessionState,
  type LessonSummary,
} from "./model/lesson-session";
import { prepareExercise, type PreparedExercise } from "./model/prepare-exercise";
import type { ExerciseResponse } from "./model/response";
import { LessonView, type LessonViewState } from "./lesson-view";

type SaveState =
  | { readonly status: "idle" | "saving" | "error" }
  | { readonly status: "saved"; readonly streakDays: number };

type Session = {
  readonly state: LessonSessionState;
  readonly prepared: readonly PreparedExercise[];
};

type LessonContainerProps = {
  lessonId: string;
  /** Content source; defaults to the bundled corpus. */
  content?: Corpus;
};

/** Runs one lesson: session reducer + exercise components, then persists the results. */
export function LessonContainer({ lessonId, content = corpus }: LessonContainerProps) {
  const { progressRepository, clock, random } = useAppServices();
  const router = useRouter();

  // Prepared once per mount, so options are not reshuffled on re-render.
  const [initial] = useState<Session | null>(() => {
    const lesson = content.lessonsById.get(lessonId);
    const exercises = lesson === undefined ? [] : lessonExercises(lesson, content.exercisesById);
    if (lesson === undefined || exercises.length === 0) return null;
    return {
      state: startLesson(lesson, exercises),
      prepared: exercises.map((e) => prepareExercise(e, random)),
    };
  });
  const [session, setSession] = useState<LessonSessionState | null>(initial?.state ?? null);
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [startedAt] = useState(() => clock.nowMs());
  const shownAt = useRef(startedAt);
  // Guards against saving twice (e.g. a double tap on the last "Continuar").
  const saving = useRef(false);

  const persist = (summary: LessonSummary) => {
    if (saving.current) return;
    saving.current = true;
    setSave({ status: "saving" });
    completeLesson({ repository: progressRepository, summary, today: clock.today() })
      .then(({ streak }) => setSave({ status: "saved", streakDays: streak.current }))
      .catch((error: unknown) => {
        console.error("Failed to save lesson results", error);
        setSave({ status: "error" });
      });
  };

  const goHome = () => (router.canDismiss() ? router.dismissAll() : router.replace("/"));

  const onSubmit = (response: ExerciseResponse) => {
    if (session === null) return;
    const responseMs = Math.max(0, clock.nowMs() - shownAt.current);
    setSession(lessonSessionReducer(session, { type: "answer", response, responseMs }));
  };

  const onContinue = () => {
    if (session === null) return;
    const next = lessonSessionReducer(session, { type: "next" });
    if (next === session) return;
    shownAt.current = clock.nowMs();
    setSession(next);
    if (next.status === "finished") persist(next.summary);
  };

  return (
    <LessonView
      state={toViewState(session, initial?.prepared ?? [], save, content)}
      onSubmit={onSubmit}
      onContinue={onContinue}
      onGoHome={goHome}
    />
  );
}

function toViewState(
  session: LessonSessionState | null,
  prepared: readonly PreparedExercise[],
  save: SaveState,
  content: Corpus,
): LessonViewState {
  if (session === null) return { status: "not-found" };
  if (session.status === "finished") {
    if (save.status === "error") return { status: "save-error" };
    if (save.status !== "saved") return { status: "saving" };
    const { verdicts, xpEarned } = session.summary;
    return {
      status: "summary",
      correct: verdicts.filter((v) => v === "correct").length,
      total: verdicts.length,
      xpEarned,
      streakDays: save.streakDays,
    };
  }
  const current = prepared[session.index];
  if (current === undefined) return { status: "not-found" };
  return {
    status: "exercise",
    title: session.lesson.title,
    position: session.index + 1,
    total: session.exercises.length,
    prepared: current,
    passage:
      current.type === "reading" ? content.passagesById.get(current.exercise.passageId) : undefined,
    feedback: session.status === "feedback" ? session.feedback : null,
  };
}
