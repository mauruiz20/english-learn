import { buildGlossaryIndex, type GlossaryEntry } from "@english-learn/domain";
import { cloze, reading, translateWrite, translationChoice, vocab, wordOrder } from "./fixtures";
import {
  answerIsEnglish,
  hasLookups,
  lookupEnabled,
  vocabLocks,
  type LookupArea,
} from "./lookup-policy";
import { prepareExercise } from "./prepare-exercise";

const rng = () => 0.5;

describe("lookupEnabled (the locking matrix)", () => {
  it.each<[LookupArea, boolean, boolean]>([
    // area, before the answer is checked, after
    ["vocab.prompt", true, true],
    ["vocab.options", false, true],
    ["cloze.sentence", true, true],
    ["cloze.options", false, true],
    ["translation_choice.sentence", false, true],
    ["word_order.tokens", false, true],
    ["reading.passage", true, true],
    ["reading.questions", true, true],
    ["reading.options", false, true],
    ["feedback.answer", true, true],
    ["summary.terms", true, true],
  ])("%s: before %j, after %j", (area, before, after) => {
    expect(lookupEnabled(area, false)).toBe(before);
    expect(lookupEnabled(area, true)).toBe(after);
  });
});

const entry = (id: string, forms: readonly string[]): GlossaryEntry => ({
  id,
  headword: forms[0] ?? id,
  kind: forms.some((f) => f.includes(" ")) ? "phrase" : "word",
  forms,
  senses: [{ es: id }],
});
const INDEX = buildGlossaryIndex([
  entry("left", ["left"]),
  entry("she", ["she"]),
  entry("early", ["early"]),
  entry("wont", ["won't"]),
  entry("me", ["me"]),
]);

describe("vocabLocks", () => {
  it("locks the quoted English term until the answer is checked", () => {
    const prompt = "What does 'wake up' mean?";
    const start = prompt.indexOf("wake");

    expect(vocabLocks(prompt, INDEX, false).lockedRanges).toEqual([[start, start + 7]]);
    expect(vocabLocks(prompt, INDEX, true).lockedRanges).toEqual([]);
  });

  it("keeps an apostrophe inside the quoted term", () => {
    const prompt = "What does 'won't' mean?";
    const start = prompt.indexOf("won't");
    expect(vocabLocks(prompt, INDEX, false).lockedRanges).toEqual([[start, start + 5]]);
  });

  it("also locks the term inside a quoted example sentence", () => {
    const locks = vocabLocks("What does 'left' mean in 'She left early'?", INDEX, false);
    expect(locks.lockedEntryIds).toEqual(["left"]);
    expect(vocabLocks("What does 'left' mean in 'She left early'?", INDEX, true)).toEqual({
      lockedRanges: [],
      lockedEntryIds: [],
    });
  });

  it("always locks the quoted Spanish term of a 'Choose the English for' prompt", () => {
    const prompt = "Choose the English for 'me levanto'.";
    const start = prompt.indexOf("me levanto");
    for (const answered of [false, true]) {
      expect(vocabLocks(prompt, INDEX, answered).lockedRanges).toEqual([[start, start + 10]]);
    }
  });
});

describe("answerIsEnglish", () => {
  it.each([
    ["cloze", cloze, true],
    ["word order", wordOrder, true],
    ["translate write", translateWrite, true],
    ["reading", reading, true],
    ["translation choice", translationChoice, false],
    ["vocab with Spanish options", vocab, false],
    ["vocab with English options", { ...vocab, prompt: "Choose the English for 'cocina'." }, true],
  ] as const)("%s -> %j", (_, exercise, expected) => {
    expect(answerIsEnglish(prepareExercise(exercise, rng))).toBe(expected);
  });
});

describe("hasLookups", () => {
  it.each([
    ["vocab", vocab, true, true],
    ["cloze", cloze, true, true],
    ["reading", reading, true, true],
    ["translation choice", translationChoice, false, true],
    ["word order", wordOrder, false, true],
    ["translate write", translateWrite, false, false],
  ] as const)("%s: before %j, after %j", (_, exercise, before, after) => {
    const prepared = prepareExercise(exercise, rng);
    expect(hasLookups(prepared, false)).toBe(before);
    expect(hasLookups(prepared, true)).toBe(after);
  });
});
