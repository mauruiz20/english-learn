import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fx from "../src/testing/fixtures";
import { formatGaps, glossaryGaps } from "./glossary-gaps";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gaps-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function write(rel: string, value: unknown): void {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(value));
}

describe("glossaryGaps", () => {
  it("returns nothing when the glossary covers the corpus", () => {
    write("b1/travel.json", fx.validFile());
    for (const { file, data } of fx.glossaryFiles()) write(file, data);
    expect(glossaryGaps(dir)).toEqual([]);
  });

  it("groups uncovered words case-insensitively, most frequent first, with one example", () => {
    write("b1/travel.json", {
      passages: [
        fx.passage({ title: "Zoo day", text: "The zoo. We saw a zoo and a Zebra." }),
        fx.passage({ id: "b1.travel.trip-2", text: "A zebra, a ZOO." }),
      ],
    });
    for (const { file, data } of fx.glossaryFiles()) write(file, data);
    expect(glossaryGaps(dir)).toEqual([
      {
        word: "zoo",
        count: 3,
        file: "b1/travel.json",
        path: "passages[0].title",
        example: "Zoo day",
      },
      {
        word: "zebra",
        count: 2,
        file: "b1/travel.json",
        path: "passages[0].text",
        example: "The zoo. We saw a zoo and a Zebra.",
      },
      {
        word: "and",
        count: 1,
        file: "b1/travel.json",
        path: "passages[0].text",
        example: "The zoo. We saw a zoo and a Zebra.",
      },
      {
        word: "day",
        count: 1,
        file: "b1/travel.json",
        path: "passages[0].title",
        example: "Zoo day",
      },
      {
        word: "saw",
        count: 1,
        file: "b1/travel.json",
        path: "passages[0].text",
        example: "The zoo. We saw a zoo and a Zebra.",
      },
    ]);
  });

  it("still works when the content has other errors", () => {
    write("b1/bad.json", { items: [{ id: "nope" }] });
    write("b1/travel.json", { passages: [fx.passage({ text: "Hello." })] });
    expect(glossaryGaps(dir).map((g) => g.word)).toContain("hello");
  });
});

describe("formatGaps", () => {
  it("prints one tab-separated line per word and a total", () => {
    const out = formatGaps([
      { word: "zoo", count: 3, file: "b1/x.json", path: "passages[0].text", example: "The zoo." },
    ]);
    expect(out).toBe("zoo\t3\tb1/x.json passages[0].text\tThe zoo.\n1 uncovered word(s)");
  });
});
