import { gradeExercise } from "@/features/lesson/model/grade-exercise";
import { placementBank } from "./fixtures";
import { placementExercise, toPlacementCandidate } from "./placement-bank";

const [vocabQ, clozeQ, choiceQ] = placementBank(3);

describe("placement bank", () => {
  it("counts the options of vocab and translation choice questions", () => {
    expect(toPlacementCandidate(vocabQ!)).toEqual({ id: vocabQ!.id, level: "A1", optionCount: 3 });
    expect(toPlacementCandidate(choiceQ!).optionCount).toBe(2);
  });

  it("counts the first answer plus the distractors of a cloze question", () => {
    expect(toPlacementCandidate(clozeQ!).optionCount).toBe(4);
  });

  it("turns a question into a gradable exercise identified by the question id", () => {
    const exercise = placementExercise(vocabQ!);

    expect(exercise).toMatchObject({ id: vocabQ!.id, level: "A1", itemIds: [], type: "vocab" });
    expect(gradeExercise(exercise, { kind: "choice", option: "ok" }).verdict).toBe("correct");
    expect(gradeExercise(exercise, { kind: "choice", option: "no" }).verdict).toBe("wrong");
  });
});
