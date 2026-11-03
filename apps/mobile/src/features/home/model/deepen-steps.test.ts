import { deepenSteps } from "./deepen-steps";

const lesson = (id: string, done: boolean, deepenCardIds?: string[]) => ({
  id,
  done,
  ...(deepenCardIds === undefined ? {} : { deepenCardIds }),
});

describe("deepenSteps", () => {
  it("lists the linked cards under each done lesson, in link order", () => {
    const steps = deepenSteps([lesson("l1", true, ["c1", "c2"]), lesson("l2", true, ["c3"])]);
    expect(steps.get("l1")).toEqual(["c1", "c2"]);
    expect(steps.get("l2")).toEqual(["c3"]);
  });

  it("shows nothing under lessons not done yet or without linked cards", () => {
    const steps = deepenSteps([lesson("l1", false, ["c1"]), lesson("l2", true)]);
    expect(steps.get("l1")).toBeUndefined();
    expect(steps.get("l2")).toBeUndefined();
  });

  it("shows a card linked by two lessons once, under the earlier done one in path order", () => {
    const steps = deepenSteps([
      lesson("l1", true, ["future-forms", "commute"]),
      lesson("l2", true, ["future-forms"]),
    ]);
    expect(steps.get("l1")).toEqual(["future-forms", "commute"]);
    expect(steps.get("l2")).toBeUndefined();
  });

  it("keeps the card's other links under the later lesson", () => {
    const steps = deepenSteps([lesson("l1", true, ["a"]), lesson("l2", true, ["a", "b"])]);
    expect(steps.get("l2")).toEqual(["b"]);
  });

  it("moves the card to a later done lesson while the earlier one is not done", () => {
    const steps = deepenSteps([
      lesson("l1", false, ["future-forms"]),
      lesson("l2", true, ["future-forms"]),
    ]);
    expect(steps.get("l1")).toBeUndefined();
    expect(steps.get("l2")).toEqual(["future-forms"]);
  });

  it("follows path order, not lesson ids", () => {
    const steps = deepenSteps([lesson("b", true, ["c"]), lesson("a", true, ["c"])]);
    expect(steps.get("b")).toEqual(["c"]);
    expect(steps.get("a")).toBeUndefined();
  });
});
