import { corpus } from "@english-learn/content/corpus";
import { correctInARow, sessionResults } from "./session-results";
import { lessonSessionReducer, startLesson } from "./lesson-session";

const vocab = corpus.exercises.filter((e) => e.type === "vocab").slice(0, 2);

describe("correctInARow", () => {
  it.each([
    [[], 0],
    [["correct"], 1],
    [["correct", "correct", "correct"], 3],
    [["correct", "wrong", "correct", "correct"], 2],
    [["correct", "almost"], 0],
  ] as const)("%p ends with %i right answers in a row", (verdicts, expected) => {
    expect(correctInARow(verdicts)).toBe(expected);
  });
});

describe("sessionResults", () => {
  it("lists the verdicts given so far, the current answer included once shown", () => {
    const start = startLesson({ id: "l", title: "L" }, vocab);
    expect(sessionResults(start)).toEqual([]);

    const answered = lessonSessionReducer(start, {
      type: "answer",
      response: { kind: "choice", option: "not an option" },
      responseMs: 1000,
    });
    expect(sessionResults(answered)).toEqual(["wrong"]);
  });

  it("has none once the session is finished (the summary has them)", () => {
    expect(sessionResults({ status: "finished", summary: {} } as never)).toEqual([]);
  });
});
