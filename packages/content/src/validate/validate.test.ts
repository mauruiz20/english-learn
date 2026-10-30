import { describe, expect, it } from "vitest";
import type { ContentFile } from "../schema";
import * as fx from "../testing/fixtures";
import {
  validateAnswerIndexes,
  validateClozes,
  validateCorpus,
  validateLevels,
  validateOptionDuplicates,
  validateReferences,
  validateSchema,
  validateUniqueIds,
  validateWordOrders,
  type LoadedFile,
} from "./index";
import { normalize } from "./helpers";

const file = (data: ContentFile, name = "b1/travel.json"): LoadedFile => ({ file: name, data });
const paths = (errs: { path: string }[]) => errs.map((e) => e.path);

describe("validateSchema", () => {
  it("returns data and no errors for valid JSON", () => {
    const r = validateSchema("b1/x.json", fx.validFile());
    expect(r.errors).toEqual([]);
    expect(r.data).toBeDefined();
  });
  it("reports file, readable path and message for invalid JSON", () => {
    const bad = { ...fx.validFile(), exercises: [{ ...fx.vocab(), options: ["a"] }] };
    const r = validateSchema("b1/x.json", bad);
    expect(r.data).toBeUndefined();
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toMatchObject({ file: "b1/x.json", path: "exercises[0].options" });
    expect(r.errors[0]?.message).toBeTruthy();
  });
});

describe("normalize", () => {
  it("applies NFC, lowercases, trims, collapses whitespace, strips trailing punctuation", () => {
    expect(normalize("  Café   LATE?! ")).toBe("café late");
    expect(normalize("Aunque.")).toBe("aunque");
    expect(normalize("Hello, world;:")).toBe("hello, world");
  });
  it("maps curly quotes to straight quotes", () => {
    expect(normalize("“It’s”")).toBe("\"it's\"");
  });
});

describe("validateUniqueIds", () => {
  it("passes for a valid corpus", () => {
    expect(validateUniqueIds([file(fx.validFile())])).toEqual([]);
  });
  it("flags duplicate item ids within a file", () => {
    const errs = validateUniqueIds([file({ items: [fx.item(), fx.item()] })]);
    expect(paths(errs)).toEqual(["items[1].id"]);
  });
  it("flags duplicates across files of the same kind", () => {
    const errs = validateUniqueIds([
      file({ exercises: [fx.vocab()] }, "b1/a.json"),
      file({ exercises: [fx.vocab()] }, "b1/b.json"),
    ]);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ file: "b1/b.json", path: "exercises[0].id" });
    expect(errs[0]?.message).toContain("b1/a.json");
  });
  it("does not flag the same id used by different entity kinds", () => {
    const errs = validateUniqueIds([
      file({
        items: [fx.item({ id: "b1.travel.same" })],
        passages: [fx.passage({ id: "b1.travel.same" })],
      }),
    ]);
    expect(errs).toEqual([]);
  });
  it("flags duplicate placement ids", () => {
    const errs = validateUniqueIds([
      file({ placement: [fx.placementQuestion(), fx.placementQuestion()] }, "placement/s.json"),
    ]);
    expect(paths(errs)).toEqual(["placement[1].id"]);
  });
});

describe("validateReferences", () => {
  it("passes when everything resolves (across files)", () => {
    const f = fx.validFile();
    const a = file({ items: f.items }, "b1/items.json");
    const b = file({ ...f, items: [] }, "b1/rest.json");
    expect(validateReferences([a, b])).toEqual([]);
  });
  it("flags unknown itemIds", () => {
    const f = fx.validFile();
    const errs = validateReferences([file({ ...f, items: [] })]);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0]?.path).toBe("exercises[0].itemIds[0]");
  });
  it("flags unknown reading passage", () => {
    const f = fx.validFile();
    const errs = validateReferences([file({ ...f, passages: [] })]);
    expect(paths(errs)).toEqual(["exercises[5].passageId"]);
  });
  it("flags unknown lesson exercise ids", () => {
    const f = fx.validFile();
    const errs = validateReferences([file({ ...f, exercises: [] })]);
    expect(paths(errs)).toContain("lessons[0].exerciseIds[0]");
  });
});

describe("validateAnswerIndexes", () => {
  it("passes for in-range indexes", () => {
    expect(validateAnswerIndexes([file(fx.validFile())])).toEqual([]);
  });
  it("flags out-of-range indexes in vocab and translation_choice", () => {
    const errs = validateAnswerIndexes([
      file({ exercises: [fx.vocab({ answerIndex: 9 }), fx.translationChoice({ answerIndex: 3 })] }),
    ]);
    expect(paths(errs)).toEqual(["exercises[0].answerIndex", "exercises[1].answerIndex"]);
  });
  it("flags out-of-range indexes in reading questions", () => {
    const r = fx.reading({
      questions: [
        { prompt: "q", options: ["a", "b", "c"], answerIndex: 0 },
        { prompt: "q", options: ["a", "b", "c"], answerIndex: 5 },
      ],
    });
    expect(paths(validateAnswerIndexes([file({ exercises: [r] })]))).toEqual([
      "exercises[0].questions[1].answerIndex",
    ]);
  });
  it("flags out-of-range indexes in placement", () => {
    const q = fx.placementQuestion();
    const bad = { ...q, exercise: { ...q.exercise, answerIndex: 7 } } as typeof q;
    const errs = validateAnswerIndexes([file({ placement: [bad] }, "placement/s.json")]);
    expect(paths(errs)).toEqual(["placement[0].exercise.answerIndex"]);
  });
});

describe("validateOptionDuplicates", () => {
  it("passes for distinct options", () => {
    expect(validateOptionDuplicates([file(fx.validFile())])).toEqual([]);
  });
  it("flags duplicates after normalization (case, trailing punctuation)", () => {
    const errs = validateOptionDuplicates([
      file({ exercises: [fx.vocab({ options: ["aunque", "aunque.", "porque"] })] }),
    ]);
    expect(errs).toEqual([
      {
        file: "b1/travel.json",
        path: "exercises[0].options[1]",
        message: 'duplicate option "aunque." (normalized)',
      },
    ]);
  });
  it("flags duplicates that differ only by curly quotes or inner whitespace", () => {
    const errs = validateOptionDuplicates([
      file({ exercises: [fx.vocab({ options: ["It’s  late", "it's late", "porque"] })] }),
    ]);
    expect(paths(errs)).toEqual(["exercises[0].options[1]"]);
  });
  it("checks translation_choice, reading questions and placement", () => {
    const dup = ["a", "A", "b"];
    const r = fx.reading({ questions: [{ prompt: "q", options: dup, answerIndex: 0 }] });
    const t = fx.translationChoice({ options: dup });
    const q = fx.placementQuestion();
    const pq = { ...q, exercise: { ...q.exercise, options: dup } } as typeof q;
    const errs = validateOptionDuplicates([file({ exercises: [t, r], placement: [pq] })]);
    expect(paths(errs)).toEqual([
      "exercises[0].options[1]",
      "exercises[1].questions[0].options[1]",
      "placement[0].exercise.options[1]",
    ]);
  });
});

describe("validateClozes", () => {
  it("passes for a valid cloze", () => {
    expect(validateClozes([file(fx.validFile())])).toEqual([]);
  });
  it("flags zero or multiple blanks", () => {
    const errs = validateClozes([
      file({
        exercises: [
          fx.cloze({ sentence: "No blank here." }),
          fx.cloze({ sentence: "___ and ___ twice." }),
        ],
      }),
    ]);
    expect(paths(errs)).toEqual(["exercises[0].sentence", "exercises[1].sentence"]);
  });
  it("flags answers that also appear in distractors (case-insensitive)", () => {
    const errs = validateClozes([
      file({
        exercises: [fx.cloze({ answers: ["Although"], distractors: ["although", "Unless"] })],
      }),
    ]);
    expect(paths(errs)).toEqual(["exercises[0].distractors[0]"]);
  });
  it("checks placement cloze exercises too", () => {
    const { id: _a, itemIds: _b, level: _c, ...c } = fx.cloze({ sentence: "none" });
    const q = { ...fx.placementQuestion(), exercise: c };
    expect(paths(validateClozes([file({ placement: [q] }, "placement/s.json")]))).toEqual([
      "placement[0].exercise.sentence",
    ]);
  });
});

describe("validateWordOrders", () => {
  it("passes when tokens joined by spaces rebuild an accepted sentence", () => {
    expect(validateWordOrders([file(fx.validFile())])).toEqual([]);
  });
  it("passes for shuffled tokens (multiset equality)", () => {
    const w = fx.wordOrder({
      tokens: ["rained.", "it", "although", "out", "went", "we"],
    });
    expect(validateWordOrders([file({ exercises: [w] })])).toEqual([]);
  });
  it("passes when only a non-first accepted sentence matches", () => {
    const w = fx.wordOrder({
      accepted: ["we went out although it was raining.", "we went out although it rained."],
    });
    expect(validateWordOrders([file({ exercises: [w] })])).toEqual([]);
  });
  it("flags tokens that match no accepted sentence", () => {
    const w = fx.wordOrder({ tokens: ["we", "went", "out", "although", "it", "rained"] });
    expect(paths(validateWordOrders([file({ exercises: [w] })]))).toEqual(["exercises[0].tokens"]);
  });
  it("is whitespace-normalized on the accepted side", () => {
    const w = fx.wordOrder({ accepted: ["  we went  out although it rained. "] });
    expect(validateWordOrders([file({ exercises: [w] })])).toEqual([]);
  });
});

describe("validateLevels", () => {
  it("passes for a consistent corpus", () => {
    expect(validateLevels([file(fx.validFile())])).toEqual([]);
  });
  it("flags an exercise whose level differs from its lesson", () => {
    const f = fx.validFile();
    const exercises = [{ ...fx.vocab(), level: "A2" as const }, ...(f.exercises ?? []).slice(1)];
    const errs = validateLevels([file({ ...f, exercises }, "b1/travel.json")]);
    expect(paths(errs)).toContain("lessons[0].exerciseIds[0]");
  });
  it("flags entities in data/a2 that are not A2", () => {
    const errs = validateLevels([file({ items: [fx.item()] }, "a2/words.json")]);
    expect(paths(errs)).toContain("items[0].level");
  });
  it("exempts the placement directory", () => {
    const errs = validateLevels([
      file({ placement: [fx.placementQuestion()] }, "placement/s.json"),
    ]);
    expect(errs).toEqual([]);
  });
  it("flags ids whose level prefix disagrees with the level field", () => {
    const errs = validateLevels([file({ items: [fx.item({ id: "a2.travel.x" })] })]);
    expect(paths(errs)).toContain("items[0].id");
  });
});

describe("validateCorpus", () => {
  it("returns no errors for a valid corpus and never throws", () => {
    expect(validateCorpus([file(fx.validFile())])).toEqual([]);
    expect(() => validateCorpus([])).not.toThrow();
  });
  it("aggregates errors from all rules", () => {
    const f = fx.validFile();
    const bad = {
      ...f,
      exercises: [fx.vocab({ answerIndex: 9 }), ...(f.exercises ?? []).slice(1)],
    };
    const errs = validateCorpus([file(bad)]);
    expect(paths(errs)).toContain("exercises[0].answerIndex");
  });
});
