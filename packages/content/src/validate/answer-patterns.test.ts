import { describe, expect, it } from "vitest";
import type { ContentFile } from "../schema";
import * as fx from "../testing/fixtures";
import { validateAnswerPatterns, validateCorpus, type LoadedFile } from "./index";

const file = (data: ContentFile, name = "b1/travel.json"): LoadedFile => ({ file: name, data });
const check = (accepted: string[]) =>
  validateAnswerPatterns([file({ exercises: [fx.translateWrite({ accepted })] })]);
const at = (path: string, message: string) => ({ file: "b1/travel.json", path, message });

describe("validateAnswerPatterns (translate_write accepted patterns)", () => {
  it("passes plain sentences and valid patterns", () => {
    expect(validateAnswerPatterns([file(fx.validFile())])).toEqual([]);
    expect(
      check([
        "{Although|Even though|Though} he was tired, he {kept|continued} walking.",
        "He kept walking[,] although he was tired.",
      ]),
    ).toEqual([]);
  });

  it("reports syntax errors", () => {
    expect(check(["He {kept walking."])).toEqual([
      at("exercises[0].accepted[0]", 'invalid answer pattern: unclosed group: missing "}"'),
    ]);
  });

  it("caps the expansions of one exercise across its entries", () => {
    const big = Array.from({ length: 10 }, () => "{a|b}").join(" ");
    const errors = check([big, `${big} c`]);
    expect(errors).toEqual([
      at(
        "exercises[0].accepted",
        "the accepted patterns stand for 2048 sentences (more than 2000)",
      ),
    ]);
  });

  it("reports one entry over the cap on its own", () => {
    const huge = Array.from({ length: 12 }, () => "{a|b}").join(" ");
    expect(check([huge])).toEqual([
      at(
        "exercises[0].accepted[0]",
        "invalid answer pattern: the pattern stands for more than 2000 sentences",
      ),
    ]);
  });

  it("forbids the same sentence (normalized) from two entries", () => {
    expect(check(["I {walk|run}.", "i run"])).toEqual([
      at(
        "exercises[0].accepted[1]",
        'duplicate accepted sentence "i run" (normalized), also from accepted[0]',
      ),
    ]);
  });

  it("checks the text rules on every expansion", () => {
    expect(check(["The show starts at 8 p.m[.]."])).toEqual([
      at(
        "exercises[0].accepted[0]",
        'expansion "The show starts at 8 p.m.." has doubled terminal punctuation',
      ),
    ]);
    expect(check(["[Yes]"])).toEqual([
      at("exercises[0].accepted[0]", "a pattern expansion is empty"),
    ]);
  });

  it("runs as part of the corpus validation", () => {
    const data = fx.validFile();
    const exercises = (data.exercises ?? []).map((e) =>
      e.type === "translate_write" ? { ...e, accepted: ["He {kept walking."] } : e,
    );
    const errors = validateCorpus([file({ ...data, exercises })]);
    expect(errors.map((e) => e.message)).toContain(
      'invalid answer pattern: unclosed group: missing "}"',
    );
  });
});
