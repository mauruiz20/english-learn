import { describe, expect, it } from "vitest";
import type { ContentFile } from "../schema";
import * as fx from "../testing/fixtures";
import {
  validateAnswerIndexes,
  validateClozes,
  validateCorpus,
  validateExerciseTopics,
  validateLayout,
  validateLevels,
  validateListDuplicates,
  validateOptionDuplicates,
  validateReferences,
  validateSchema,
  validateTopics,
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
  it("rejects a blank written with 4+ underscores", () => {
    const errs = validateClozes([
      file({ exercises: [fx.cloze({ sentence: "____ it was raining, we went out." })] }),
    ]);
    expect(errs).toEqual([
      {
        file: "b1/travel.json",
        path: "exercises[0].sentence",
        message: 'cloze sentence must contain exactly one blank written as "___" (found "____")',
      },
    ]);
  });
  it("counts every underscore run, whatever its length", () => {
    const errs = validateClozes([
      file({ exercises: [fx.cloze({ sentence: "___ it was raining, we went _ out." })] }),
    ]);
    expect(errs).toEqual([
      {
        file: "b1/travel.json",
        path: "exercises[0].sentence",
        message: 'cloze sentence must contain exactly one blank written as "___" (found "___", "_")',
      },
    ]);
  });
  it("rejects underscores inside answers and distractors", () => {
    const errs = validateClozes([
      file({ exercises: [fx.cloze({ answers: ["Al_though"], distractors: ["Because", "__"] })] }),
    ]);
    expect(errs).toEqual([
      {
        file: "b1/travel.json",
        path: "exercises[0].answers[0]",
        message: 'answer "Al_though" must not contain "_"',
      },
      {
        file: "b1/travel.json",
        path: "exercises[0].distractors[1]",
        message: 'distractor "__" must not contain "_"',
      },
    ]);
  });
  it("flags normalized duplicates among answers and among distractors", () => {
    const errs = validateClozes([
      file({
        exercises: [
          fx.cloze({ answers: ["Although", "although."], distractors: ["Because", "because"] }),
        ],
      }),
    ]);
    expect(errs).toEqual([
      {
        file: "b1/travel.json",
        path: "exercises[0].answers[1]",
        message: 'duplicate answer "although." (normalized)',
      },
      {
        file: "b1/travel.json",
        path: "exercises[0].distractors[1]",
        message: 'duplicate distractor "because" (normalized)',
      },
    ]);
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
  it("flags an accepted sentence the tokens cannot build, even if another one matches", () => {
    const w = fx.wordOrder({
      accepted: ["we went out although it was raining.", "we went out although it rained."],
    });
    expect(validateWordOrders([file({ exercises: [w] })])).toEqual([
      {
        file: "b1/travel.json",
        path: "exercises[0].accepted[0]",
        message:
          "accepted sentence cannot be built from the tokens (compare as a multiset of whitespace-split words, punctuation attached)",
      },
    ]);
  });
  it("flags every accepted sentence when the tokens match none", () => {
    const w = fx.wordOrder({ tokens: ["although", "we", "rained", "went", "it", "out"] });
    expect(paths(validateWordOrders([file({ exercises: [w] })]))).toEqual([
      "exercises[0].accepted[0]",
    ]);
  });
  it("flags tokens already in the order of the canonical sentence", () => {
    const w = fx.wordOrder({ tokens: ["we", "went", "out", "although", "it", "rained."] });
    expect(validateWordOrders([file({ exercises: [w] })])).toEqual([
      {
        file: "b1/travel.json",
        path: "exercises[0].tokens",
        message: "tokens are already in the order of an accepted sentence; scramble them",
      },
    ]);
  });
  it("flags tokens already in the order of a non-first accepted sentence", () => {
    const w = fx.wordOrder({
      tokens: ["usually", "I", "go", "there"],
      accepted: ["I usually go there", "usually I go there"],
    });
    expect(paths(validateWordOrders([file({ exercises: [w] })]))).toEqual(["exercises[0].tokens"]);
  });
  it("is whitespace-normalized on the accepted side", () => {
    const w = fx.wordOrder({ accepted: ["  we went  out although it rained. "] });
    expect(validateWordOrders([file({ exercises: [w] })])).toEqual([]);
  });
});

describe("validateListDuplicates", () => {
  it("passes for a valid corpus", () => {
    expect(validateListDuplicates([file(fx.validFile())])).toEqual([]);
  });
  it("flags repeated ids (exact) and repeated text (normalized) inside one entity", () => {
    const f = fx.validFile();
    const errs = validateListDuplicates([
      file({
        items: [fx.item({ topics: ["travel", "Travel"] })],
        passages: [fx.passage({ topics: ["travel", "travel"] })],
        exercises: [
          fx.vocab({ itemIds: ["b1.travel.although", "b1.travel.although"] }),
          fx.wordOrder({
            accepted: ["we went out although it rained.", "We went out although it rained"],
          }),
          fx.translateWrite({
            accepted: ["Although he was tired, he kept walking.", "although he was tired, he kept walking!"],
          }),
        ],
        lessons: [
          fx.lesson({ exerciseIds: [...f.lessons![0]!.exerciseIds, "b1.travel.vocab-001"] }),
        ],
      }),
    ]);
    const at = (path: string, message: string) => ({ file: "b1/travel.json", path, message });
    expect(errs).toEqual([
      at("items[0].topics[1]", 'duplicate topic "Travel" (normalized)'),
      at("passages[0].topics[1]", 'duplicate topic "travel" (normalized)'),
      at("exercises[0].itemIds[1]", 'duplicate item id "b1.travel.although"'),
      at(
        "exercises[1].accepted[1]",
        'duplicate accepted sentence "We went out although it rained" (normalized)',
      ),
      at(
        "exercises[2].accepted[1]",
        'duplicate accepted sentence "although he was tired, he kept walking!" (normalized)',
      ),
      at("lessons[0].exerciseIds[5]", 'duplicate exercise id "b1.travel.vocab-001"'),
    ]);
  });
  it("compares ids exactly, not normalized", () => {
    const errs = validateListDuplicates([
      file({ exercises: [fx.vocab({ itemIds: ["b1.travel.a", "b1.travel.a-"] })] }),
    ]);
    expect(errs).toEqual([]);
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
    expect(errs).toEqual([
      {
        file: "b1/travel.json",
        path: "lessons[0].exerciseIds[0]",
        message: 'exercise "b1.travel.vocab-001" is A2 but the lesson is B1',
      },
    ]);
  });
});

describe("validateTopics", () => {
  it("passes for a valid corpus", () => {
    expect(validateTopics([file(fx.validFile())])).toEqual([]);
  });
  it("flags lesson, lesson exercise, item and passage topics that disagree with ids", () => {
    const f = fx.validFile();
    const exerciseIds = [...f.lessons![0]!.exerciseIds.slice(1), "b1.food.vocab-001"];
    const errs = validateTopics([
      file({
        items: [fx.item({ topics: ["grammar"] })],
        passages: [fx.passage({ topics: ["food"] })],
        lessons: [fx.lesson({ topic: "food", id: "b1.travel.lesson-001" }), fx.lesson({ exerciseIds })],
      }),
    ]);
    const at = (path: string, message: string) => ({ file: "b1/travel.json", path, message });
    expect(errs).toEqual([
      at("items[0].topics", 'topics must include "travel", the topic segment of its id'),
      at("passages[0].topics", 'topics must include "travel", the topic segment of its id'),
      at("lessons[0].topic", 'lesson topic "food" does not match the topic segment of its id "travel"'),
      at("lessons[0].exerciseIds[0]", 'exercise "b1.travel.vocab-001" is not in lesson topic "food"'),
      at("lessons[0].exerciseIds[1]", 'exercise "b1.travel.cloze-001" is not in lesson topic "food"'),
      at("lessons[0].exerciseIds[2]", 'exercise "b1.travel.order-001" is not in lesson topic "food"'),
      at("lessons[0].exerciseIds[3]", 'exercise "b1.travel.tchoice-001" is not in lesson topic "food"'),
      at("lessons[0].exerciseIds[4]", 'exercise "b1.travel.write-001" is not in lesson topic "food"'),
      at("lessons[1].exerciseIds[4]", 'exercise "b1.food.vocab-001" is not in lesson topic "travel"'),
    ]);
  });
});

describe("validateExerciseTopics", () => {
  it("passes for a valid corpus", () => {
    expect(validateExerciseTopics([file(fx.validFile())])).toEqual([]);
  });
  it("flags an exercise whose id topic is not a topic of any referenced item", () => {
    const errs = validateExerciseTopics([
      file({
        items: [fx.item({ topics: ["travel"] }), fx.item({ id: "b1.food.soup", topics: ["food"] })],
        exercises: [
          fx.vocab({ id: "b1.work.vocab-001" }),
          fx.vocab({ id: "b1.food.vocab-002", itemIds: ["b1.travel.although", "b1.food.soup"] }),
        ],
      }),
    ]);
    expect(errs).toEqual([
      {
        file: "b1/travel.json",
        path: "exercises[0].id",
        message: 'exercise topic "work" is not a topic of any referenced item',
      },
    ]);
  });
  it("leaves unknown item ids to the reference rule", () => {
    const errs = validateExerciseTopics([file({ exercises: [fx.vocab()] })]);
    expect(errs).toEqual([]);
  });
});

describe("validateLayout", () => {
  const ROOT_MSG =
    'content files must live in data/<a1|a2|b1|b2|c1|placement>/; "x.json" is at the root';
  it("passes for a level file and a placement file", () => {
    expect(
      validateLayout([
        file(fx.validFile(), "b1/travel.json"),
        file({ placement: [fx.placementQuestion()] }, "placement/s.json"),
      ]),
    ).toEqual([]);
  });
  it("rejects root-level files (and does not guess their level)", () => {
    const errs = validateLayout([
      file({ items: [fx.item({ id: "a2.travel.x", level: "A2" })] }, "x.json"),
    ]);
    expect(errs).toEqual([{ file: "x.json", path: "(root)", message: ROOT_MSG }]);
  });
  it("rejects unknown first directories, including upper-case levels", () => {
    const errs = validateLayout([
      file({ items: [fx.item()] }, "misc/x.json"),
      file({ items: [fx.item()] }, "B1/x.json"),
    ]);
    expect(errs).toEqual([
      {
        file: "misc/x.json",
        path: "(root)",
        message: 'unknown content directory "misc"; expected one of a1, a2, b1, b2, c1, placement',
      },
      {
        file: "B1/x.json",
        path: "(root)",
        message: 'unknown content directory "B1"; expected one of a1, a2, b1, b2, c1, placement',
      },
    ]);
  });
  it("only allows placement entries under placement/", () => {
    const errs = validateLayout([
      file({ items: [fx.item()], placement: [fx.placementQuestion()] }, "placement/s.json"),
    ]);
    expect(errs).toEqual([
      {
        file: "placement/s.json",
        path: "items[0]",
        message: "placement/ may contain only placement entries",
      },
    ]);
  });
  it("rejects placement entries inside a level directory", () => {
    const errs = validateLayout([file({ placement: [fx.placementQuestion()] }, "b1/s.json")]);
    expect(errs).toEqual([
      {
        file: "b1/s.json",
        path: "placement[0]",
        message: "placement entries belong in placement/, not b1/",
      },
    ]);
  });
  it("flags entities whose level differs from their directory (nested dirs too)", () => {
    const errs = validateLayout([file({ items: [fx.item()] }, "a2/sub/words.json")]);
    expect(errs).toEqual([
      {
        file: "a2/sub/words.json",
        path: "items[0].level",
        message: "level B1 does not match directory level A2",
      },
    ]);
  });
  it("flags ids whose level prefix disagrees with the level field", () => {
    const errs = validateLayout([file({ items: [fx.item({ id: "a2.travel.x" })] })]);
    expect(errs).toEqual([
      {
        file: "b1/travel.json",
        path: "items[0].id",
        message: 'id "a2.travel.x" does not start with its level "b1."',
      },
    ]);
  });
  it("flags placement ids whose level prefix disagrees with the level field", () => {
    const errs = validateLayout([
      file({ placement: [fx.placementQuestion({ id: "placement.a2.001" })] }, "placement/s.json"),
    ]);
    expect(errs).toEqual([
      {
        file: "placement/s.json",
        path: "placement[0].id",
        message: 'id "placement.a2.001" does not start with "placement.b1."',
      },
    ]);
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
