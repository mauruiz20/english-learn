import { dropOnLine, insertionIndex, moveWithinLine, type Rect } from "./word-order-line";

// Two rows of strips on the answer line: [0 1 2] then [3 4].
const strip = (x: number, y: number, width = 60): Rect => ({ x, y, width, height: 40 });
const slots = [strip(0, 0), strip(70, 0), strip(140, 0), strip(0, 50), strip(70, 50)];

describe("insertionIndex", () => {
  it("puts a strip dropped on an empty line first", () => {
    expect(insertionIndex([], { x: 10, y: 10 })).toBe(0);
  });

  it("inserts before the first strip whose middle is right of the drop, on that row", () => {
    expect(insertionIndex(slots, { x: 5, y: 20 })).toBe(0);
    expect(insertionIndex(slots, { x: 95, y: 20 })).toBe(1);
    expect(insertionIndex(slots, { x: 105, y: 20 })).toBe(2);
  });

  it("appends to a row when dropped past its last strip", () => {
    expect(insertionIndex(slots, { x: 400, y: 20 })).toBe(3);
    expect(insertionIndex(slots, { x: 400, y: 70 })).toBe(5);
  });

  it("finds the row of a drop on a wrapped line", () => {
    expect(insertionIndex(slots, { x: 80, y: 70 })).toBe(4);
  });

  it("puts a drop above every row first and below every row last", () => {
    expect(insertionIndex(slots, { x: 200, y: -30 })).toBe(0);
    expect(insertionIndex(slots, { x: 0, y: 300 })).toBe(5);
  });
});

describe("moveWithinLine", () => {
  const line = [3, 0, 2, 1];

  it("moves a strip to the right, before the strip it was dropped on", () => {
    // Insertion indexes count the strip being moved, like the slots measured before the drag.
    expect(moveWithinLine(line, 0, 3)).toEqual([0, 2, 3, 1]);
    expect(moveWithinLine(line, 0, 4)).toEqual([0, 2, 1, 3]);
  });

  it("moves a strip to the left", () => {
    expect(moveWithinLine(line, 3, 0)).toEqual([1, 3, 0, 2]);
  });

  it("leaves the line as it was when a strip is dropped back in its own place", () => {
    expect(moveWithinLine(line, 1, 1)).toBe(line);
    expect(moveWithinLine(line, 1, 2)).toBe(line);
  });

  it("ignores positions outside the line", () => {
    expect(moveWithinLine(line, 7, 0)).toBe(line);
  });
});

describe("dropOnLine", () => {
  it("adds a word from the bank where it was dropped", () => {
    expect(dropOnLine([3, 0], 2, 1)).toEqual([3, 2, 0]);
    expect(dropOnLine([], 2, 0)).toEqual([2]);
  });

  it("reorders a word already on the line", () => {
    expect(dropOnLine([3, 0, 2], 3, 3)).toEqual([0, 2, 3]);
  });

  it("clamps the position to the line", () => {
    expect(dropOnLine([3, 0], 2, 9)).toEqual([3, 0, 2]);
  });
});
