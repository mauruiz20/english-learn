import { createCompletionMemory, newlyCompleted } from "./completion-memory";

describe("newlyCompleted", () => {
  it("celebrates nothing on the first look of the session (it cannot tell what is new)", () => {
    expect([...newlyCompleted(null, ["a", "b"])]).toEqual([]);
  });

  it("finds the lessons completed since the last look", () => {
    expect([...newlyCompleted(new Set(["a"]), ["a", "b"])]).toEqual(["b"]);
  });

  it("ignores lessons that stopped being done (e.g. another level's index)", () => {
    expect([...newlyCompleted(new Set(["a", "b"]), ["a"])]).toEqual([]);
  });
});

describe("createCompletionMemory", () => {
  it("draws each new check once: returning home again does not replay it", () => {
    const memory = createCompletionMemory();

    expect([...memory.take(["a"])]).toEqual([]);
    expect([...memory.take(["a", "b"])]).toEqual(["b"]);
    expect([...memory.take(["a", "b"])]).toEqual([]);
  });
});
