import { describe, expect, it } from "vitest";
import {
  ContentFileSchema,
  ExerciseSchema,
  GlossaryEntrySchema,
  ItemSchema,
  LessonSchema,
  LevelSchema,
  NonEmptyString,
  PassageSchema,
  PlacementQuestionSchema,
  SourceSchema,
} from "./index";
import * as fx from "../testing/fixtures";

describe("NonEmptyString", () => {
  it("accepts text with inner spaces", () => {
    expect(NonEmptyString.safeParse("go to bed").success).toBe(true);
  });
  it("rejects empty, blank and padded strings with one readable issue", () => {
    for (const s of ["", " ", "\t", " aunque", "aunque ", "aunque\n"]) {
      const r = NonEmptyString.safeParse(s);
      expect(r.success, JSON.stringify(s)).toBe(false);
      expect(r.error?.issues.map((i) => i.message)).toEqual([
        "must be non-empty and have no leading or trailing whitespace",
      ]);
    }
  });
  it("is applied to every free-text field", () => {
    const pad = " x";
    const tq = fx.translationChoice();
    const cases: [string, unknown, { safeParse: (v: unknown) => { success: boolean } }][] = [
      ["item.term", fx.item({ term: pad }), ItemSchema],
      ["item.es", fx.item({ es: pad }), ItemSchema],
      ["item.topics[]", fx.item({ topics: [pad] }), ItemSchema],
      ["passage.title", fx.passage({ title: pad }), PassageSchema],
      ["passage.text", fx.passage({ text: pad }), PassageSchema],
      ["lesson.topic", fx.lesson({ topic: pad }), LessonSchema],
      ["lesson.title", fx.lesson({ title: pad }), LessonSchema],
      ["vocab.prompt", fx.vocab({ prompt: pad }), ExerciseSchema],
      ["vocab.options[]", fx.vocab({ options: ["a", "b", pad] }), ExerciseSchema],
      ["tchoice.sentence", { ...tq, sentence: pad }, ExerciseSchema],
      ["cloze.sentence", fx.cloze({ sentence: "___ x " }), ExerciseSchema],
      ["cloze.answers[]", fx.cloze({ answers: [pad] }), ExerciseSchema],
      ["cloze.distractors[]", fx.cloze({ distractors: ["Unless", pad] }), ExerciseSchema],
      ["cloze.es", fx.cloze({ es: pad }), ExerciseSchema],
      ["word_order.tokens[]", fx.wordOrder({ tokens: ["a", "b", pad] }), ExerciseSchema],
      ["word_order.accepted[]", fx.wordOrder({ accepted: [pad] }), ExerciseSchema],
      ["translate_write.es", fx.translateWrite({ es: pad }), ExerciseSchema],
      ["translate_write.accepted[]", fx.translateWrite({ accepted: [pad] }), ExerciseSchema],
      [
        "reading.questions[].prompt",
        fx.reading({ questions: [{ prompt: pad, options: ["a", "b", "c"], answerIndex: 0 }] }),
        ExerciseSchema,
      ],
      [
        "tatoeba.author",
        { kind: "tatoeba", sentenceId: 1, author: pad, license: "CC BY 2.0 FR" },
        SourceSchema,
      ],
    ];
    for (const [name, value, schema] of cases) {
      expect(schema.safeParse(value).success, name).toBe(false);
    }
  });
});

describe("LevelSchema", () => {
  it("accepts CEFR levels A1-C1 and rejects others", () => {
    for (const l of ["A1", "A2", "B1", "B2", "C1"])
      expect(LevelSchema.safeParse(l).success).toBe(true);
    expect(LevelSchema.safeParse("C2").success).toBe(false);
    expect(LevelSchema.safeParse("b1").success).toBe(false);
  });
});

describe("SourceSchema", () => {
  it("accepts original", () => {
    expect(SourceSchema.safeParse({ kind: "original" }).success).toBe(true);
  });
  it("accepts a valid tatoeba source", () => {
    const s = { kind: "tatoeba", sentenceId: 123, author: "someone", license: "CC BY 2.0 FR" };
    expect(SourceSchema.safeParse(s).success).toBe(true);
  });
  it("rejects tatoeba with wrong license, empty author or non-integer id", () => {
    const base = { kind: "tatoeba", sentenceId: 1, author: "a", license: "CC BY 2.0 FR" };
    expect(SourceSchema.safeParse({ ...base, license: "MIT" }).success).toBe(false);
    expect(SourceSchema.safeParse({ ...base, author: "" }).success).toBe(false);
    expect(SourceSchema.safeParse({ ...base, sentenceId: 1.5 }).success).toBe(false);
  });
  it("rejects unknown kinds", () => {
    expect(SourceSchema.safeParse({ kind: "web" }).success).toBe(false);
  });
});

describe("ItemSchema", () => {
  it("accepts a valid item", () => {
    expect(ItemSchema.safeParse(fx.item()).success).toBe(true);
  });
  it("rejects ids not matching level.topic.slug", () => {
    for (const id of [
      "although",
      "B1.travel.although",
      "b1.travel",
      "b3.travel.x",
      "b1.Travel.x",
    ]) {
      expect(ItemSchema.safeParse(fx.item({ id })).success, id).toBe(false);
    }
  });
  it("requires at least one topic and a known kind", () => {
    expect(ItemSchema.safeParse(fx.item({ topics: [] })).success).toBe(false);
    expect(ItemSchema.safeParse({ ...fx.item(), kind: "verb" }).success).toBe(false);
  });
  it("rejects unknown keys", () => {
    expect(ItemSchema.safeParse({ ...fx.item(), extra: 1 }).success).toBe(false);
  });
  it("takes an optional example sentence with its Spanish", () => {
    const example = { en: "Although it rained, we went out.", es: "Aunque llovió, salimos." };
    expect(ItemSchema.safeParse(fx.item({ example })).success).toBe(true);
    expect(ItemSchema.safeParse(fx.item({ example: { en: example.en } as never })).success).toBe(
      false,
    );
    expect(ItemSchema.safeParse(fx.item({ example: { ...example, es: " x" } })).success).toBe(
      false,
    );
  });
});

describe("ExerciseSchema", () => {
  it("accepts every exercise type", () => {
    const all = [
      fx.vocab(),
      fx.cloze(),
      fx.wordOrder(),
      fx.translationChoice(),
      fx.reading(),
      fx.translateWrite(),
    ];
    for (const e of all) expect(ExerciseSchema.safeParse(e).success, e.type).toBe(true);
  });
  it("accepts cloze without the optional es", () => {
    const { es: _es, ...rest } = fx.cloze();
    expect(ExerciseSchema.safeParse(rest).success).toBe(true);
  });
  it("rejects an unknown type", () => {
    expect(ExerciseSchema.safeParse({ ...fx.vocab(), type: "listening" }).success).toBe(false);
  });
  it("requires 3-4 options", () => {
    expect(ExerciseSchema.safeParse(fx.vocab({ options: ["a", "b"] })).success).toBe(false);
    expect(ExerciseSchema.safeParse(fx.vocab({ options: ["a", "b", "c", "d", "e"] })).success).toBe(
      false,
    );
    expect(ExerciseSchema.safeParse(fx.vocab({ options: ["a", "b", "c", "d"] })).success).toBe(
      true,
    );
  });
  it("requires non-empty itemIds and a valid id", () => {
    expect(ExerciseSchema.safeParse(fx.vocab({ itemIds: [] })).success).toBe(false);
    expect(ExerciseSchema.safeParse(fx.vocab({ id: "bad" })).success).toBe(false);
  });
  it("rejects negative and non-integer answerIndex", () => {
    expect(ExerciseSchema.safeParse(fx.vocab({ answerIndex: -1 })).success).toBe(false);
    expect(ExerciseSchema.safeParse(fx.vocab({ answerIndex: 0.5 })).success).toBe(false);
  });
  it("word_order needs >= 3 tokens and >= 1 accepted", () => {
    expect(ExerciseSchema.safeParse(fx.wordOrder({ tokens: ["a", "b"] })).success).toBe(false);
    expect(ExerciseSchema.safeParse(fx.wordOrder({ accepted: [] })).success).toBe(false);
  });
  it("cloze needs at least one answer", () => {
    expect(ExerciseSchema.safeParse(fx.cloze({ answers: [] })).success).toBe(false);
  });
  it("cloze needs at least two distractors", () => {
    const r = ExerciseSchema.safeParse(fx.cloze({ distractors: ["Because"] }));
    expect(r.error?.issues.map((i) => i.path)).toEqual([["distractors"]]);
    expect(ExerciseSchema.safeParse(fx.cloze({ distractors: [] })).success).toBe(false);
  });
  it("reading needs at least one question", () => {
    expect(ExerciseSchema.safeParse(fx.reading({ questions: [] })).success).toBe(false);
  });
  it("translate_write needs at least one accepted sentence", () => {
    expect(ExerciseSchema.safeParse(fx.translateWrite({ accepted: [] })).success).toBe(false);
  });
});

describe("PassageSchema / LessonSchema", () => {
  it("accept valid fixtures", () => {
    expect(PassageSchema.safeParse(fx.passage()).success).toBe(true);
    expect(LessonSchema.safeParse(fx.lesson()).success).toBe(true);
  });
  it("lesson needs at least 5 exercises", () => {
    const ids = fx.lesson().exerciseIds.slice(0, 4);
    expect(LessonSchema.safeParse(fx.lesson({ exerciseIds: ids })).success).toBe(false);
  });
  it("passage needs a topic", () => {
    expect(PassageSchema.safeParse(fx.passage({ topics: [] })).success).toBe(false);
  });
});

describe("PlacementQuestionSchema", () => {
  it("accepts vocab, cloze and translation_choice exercises", () => {
    expect(PlacementQuestionSchema.safeParse(fx.placementQuestion()).success).toBe(true);
    const { id: _a, itemIds: _b, level: _c, ...cloze } = fx.cloze();
    const { id: _d, itemIds: _e, level: _f, ...tc } = fx.translationChoice();
    expect(
      PlacementQuestionSchema.safeParse({ ...fx.placementQuestion(), exercise: cloze }).success,
    ).toBe(true);
    expect(
      PlacementQuestionSchema.safeParse({ ...fx.placementQuestion(), exercise: tc }).success,
    ).toBe(true);
  });
  it("rejects non auto-gradable quick types", () => {
    const { id: _a, itemIds: _b, level: _c, ...reading } = fx.reading();
    expect(
      PlacementQuestionSchema.safeParse({ ...fx.placementQuestion(), exercise: reading }).success,
    ).toBe(false);
  });
});

describe("ContentFileSchema", () => {
  it("accepts an empty file and a full valid file", () => {
    expect(ContentFileSchema.safeParse({}).success).toBe(true);
    expect(ContentFileSchema.safeParse(fx.validFile()).success).toBe(true);
  });
  it("rejects unknown top-level keys", () => {
    expect(ContentFileSchema.safeParse({ itemz: [] }).success).toBe(false);
  });
});

describe("GlossaryEntrySchema", () => {
  it("accepts a word entry and a phrase entry, with or without pos", () => {
    expect(GlossaryEntrySchema.safeParse(fx.glossaryEntry()).success).toBe(true);
    const phrase = fx.glossaryEntry({
      id: "glossary.traffic-jam",
      headword: "traffic jam",
      kind: "phrase",
      forms: ["traffic jam", "traffic jams"],
      senses: [{ es: "embotellamiento" }],
    });
    expect(GlossaryEntrySchema.safeParse(phrase).success).toBe(true);
  });
  it("rejects ids that do not look like glossary.<slug>", () => {
    for (const id of ["although", "glossary.", "glossary.Although", "b1.travel.although"]) {
      expect(GlossaryEntrySchema.safeParse(fx.glossaryEntry({ id })).success, id).toBe(false);
    }
  });
  it("needs 1 to 3 senses and at least one form", () => {
    const sense = { es: "aunque" };
    for (const senses of [[], [sense, sense, sense, sense]]) {
      expect(GlossaryEntrySchema.safeParse(fx.glossaryEntry({ senses })).success).toBe(false);
    }
    expect(GlossaryEntrySchema.safeParse(fx.glossaryEntry({ forms: [] })).success).toBe(false);
  });
  it("applies NonEmptyString to headword, forms and senses, and rejects unknown keys or pos", () => {
    const bad: unknown[] = [
      fx.glossaryEntry({ headword: " although" }),
      fx.glossaryEntry({ forms: [""] }),
      fx.glossaryEntry({ senses: [{ es: "aunque " }] }),
      { ...fx.glossaryEntry(), extra: 1 },
      { ...fx.glossaryEntry(), senses: [{ es: "aunque", note: "x" }] },
      { ...fx.glossaryEntry(), senses: [{ es: "aunque", pos: "thing" }] },
      { ...fx.glossaryEntry(), kind: "grammar" },
    ];
    for (const value of bad) expect(GlossaryEntrySchema.safeParse(value).success).toBe(false);
  });
  it("is allowed in a content file", () => {
    expect(ContentFileSchema.safeParse({ glossary: [fx.glossaryEntry()] }).success).toBe(true);
  });
});
