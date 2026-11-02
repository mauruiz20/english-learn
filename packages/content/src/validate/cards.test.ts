import { describe, expect, it } from "vitest";
import type { Card, ContentFile } from "../schema";
import * as fx from "../testing/fixtures";
import {
  glossaryTexts,
  validateCardReferences,
  validateCards,
  validateCorpus,
  validateLayout,
  validateUniqueIds,
  type LoadedFile,
} from "./index";

const paths = (errs: { path: string }[]) => errs.map((e) => e.path);

/** `cardFile()` with its card replaced by `c` and the data patched by `patch`. */
function withCard(c: Card, patch: Partial<ContentFile> = {}, name?: string): LoadedFile {
  const f = fx.cardFile(c);
  return { file: name ?? f.file, data: { ...f.data, ...patch } };
}

describe("validateCards", () => {
  it("passes for valid grammar, phrasal-verb and vocabulary cards", () => {
    expect(validateCards([fx.cardFile()])).toEqual([]);
    expect(
      validateCards([
        { file: "b1/phrasal-verbs.json", data: { cards: [fx.phrasalVerbCard()] } },
        { file: "b1/vocabulary.json", data: { cards: [fx.vocabularyCard()] } },
      ]),
    ).toEqual([]);
  });

  it("requires the id topic segment to be the card topic", () => {
    const errs = validateCards([withCard(fx.card({ id: "b1.travel.although" }))]);
    expect(errs).toEqual([
      {
        file: "b1/grammar.json",
        path: "cards[0].id",
        message: 'card id "b1.travel.although" must have the topic segment "grammar"',
      },
    ]);
  });

  it("requires cards to live in <level>/<topic>.json", () => {
    const errs = validateCards([
      withCard(fx.card(), {}, "b1/travel.json"),
      withCard(fx.card(), {}, "b1/sub/grammar.json"),
    ]);
    expect(errs).toEqual([
      {
        file: "b1/travel.json",
        path: "cards[0]",
        message: "grammar cards belong in <level>/grammar.json",
      },
      {
        file: "b1/sub/grammar.json",
        path: "cards[0]",
        message: "grammar cards belong in <level>/grammar.json",
      },
    ]);
  });

  it("rejects a pitfall whose wrong and right versions are the same (normalized)", () => {
    const pitfall = { wrong: "We went out.", right: "we went out", why: "Igual." };
    const errs = validateCards([withCard(fx.card({ pitfalls: [pitfall] }))]);
    expect(errs).toEqual([
      {
        file: "b1/grammar.json",
        path: "cards[0].pitfalls[0]",
        message: 'pitfall "wrong" and "right" are the same sentence',
      },
    ]);
  });

  it("rejects duplicate examples, uses, item ids and exercise ids", () => {
    const c = fx.card();
    const [first, ...rest] = c.examples;
    const errs = validateCards([
      withCard(
        fx.card({
          examples: [
            first!,
            ...rest.slice(0, 2),
            { en: `${first!.en.toLowerCase()}`, es: "Otra." },
          ],
          uses: ["Contrastar.", "contrastar"],
          itemIds: [...c.itemIds, ...c.itemIds],
          exerciseIds: [...c.exerciseIds.slice(0, 5), c.exerciseIds[0]!],
        }),
      ),
    ]);
    expect(paths(errs)).toEqual([
      "cards[0].uses[1]",
      "cards[0].examples[3].en",
      "cards[0].itemIds[1]",
      "cards[0].exerciseIds[5]",
    ]);
  });

  it("rejects duplicate phrasal verbs and collocations inside a card", () => {
    const pv = fx.phrasalVerbCard();
    const entries = pv.kind === "phrasal_verbs" ? pv.entries : [];
    const errs = validateCards([
      {
        file: "b1/phrasal-verbs.json",
        data: {
          cards: [
            fx.phrasalVerbCard({
              entries: [...entries, { ...entries[0]!, verb: "Go out" }],
            } as Partial<Card>),
          ],
        },
      },
      {
        file: "b1/vocabulary.json",
        data: {
          cards: [
            fx.vocabularyCard({
              collocations: [
                { en: "late summer", es: "fines del verano" },
                { en: "Late summer", es: "final del verano" },
              ],
            } as Partial<Card>),
          ],
        },
      },
    ]);
    expect(paths(errs)).toEqual(["cards[0].entries[3].verb", "cards[0].collocations[1].en"]);
  });
});

describe("validateCardReferences", () => {
  it("passes for a card whose items and exercises exist and match", () => {
    expect(validateCardReferences([fx.cardFile()])).toEqual([]);
  });

  it("flags unknown items and exercises", () => {
    const c = fx.card();
    const errs = validateCardReferences([
      withCard(
        fx.card({
          itemIds: [...c.itemIds, "b1.grammar.missing"],
          exerciseIds: [...c.exerciseIds, "b1.grammar.missing-cloze"],
        }),
      ),
    ]);
    expect(errs).toEqual([
      {
        file: "b1/grammar.json",
        path: "cards[0].itemIds[1]",
        message: 'unknown item id "b1.grammar.missing"',
      },
      {
        file: "b1/grammar.json",
        path: "cards[0].exerciseIds[6]",
        message: 'unknown exercise id "b1.grammar.missing-cloze"',
      },
    ]);
  });

  it("requires exercises with the card level and topic", () => {
    const f = fx.cardFile();
    const exercises = (f.data.exercises ?? []).map((e, i) =>
      i === 0 ? { ...e, level: "B2" as const } : i === 1 ? { ...e, id: "b1.travel.x-cloze" } : e,
    );
    const c = fx.card({
      exerciseIds: fx.card().exerciseIds.map((id, i) => (i === 1 ? "b1.travel.x-cloze" : id)),
    });
    const errs = validateCardReferences([withCard(c, { exercises })]);
    expect(errs).toEqual([
      {
        file: "b1/grammar.json",
        path: "cards[0].exerciseIds[0]",
        message: 'exercise "b1.grammar.although-vocab-1" is B2 but the card is B1',
      },
      {
        file: "b1/grammar.json",
        path: "cards[0].exerciseIds[1]",
        message: 'exercise "b1.travel.x-cloze" is not in the card topic "grammar"',
      },
    ]);
  });

  it("requires items at or below the card level that include the card topic", () => {
    const f = fx.cardFile();
    const [it] = f.data.items ?? [];
    const errs = validateCardReferences([
      withCard(fx.card(), { items: [{ ...it!, level: "B2", topics: ["travel"] }] }),
    ]);
    expect(errs.map((e) => e.message)).toEqual([
      'item "b1.grammar.although" is B2, above the card level B1',
      'item "b1.grammar.although" does not have the card topic "grammar"',
    ]);
  });

  it("requires every item an exercise practices to belong to the card", () => {
    const f = fx.cardFile();
    const extra = fx.item({ id: "b1.grammar.but", topics: ["grammar"], term: "but", es: "pero" });
    const exercises = (f.data.exercises ?? []).map((e, i) =>
      i === 2 ? { ...e, itemIds: [...e.itemIds, extra.id] } : e,
    );
    const errs = validateCardReferences([
      withCard(fx.card(), { items: [...(f.data.items ?? []), extra], exercises }),
    ]);
    expect(errs).toEqual([
      {
        file: "b1/grammar.json",
        path: "cards[0].exerciseIds[2]",
        message:
          'exercise "b1.grammar.although-cloze-2" practices item "b1.grammar.but", which is not in the card',
      },
    ]);
  });

  it("requires every card item to be practiced by at least one card exercise", () => {
    const f = fx.cardFile();
    const extra = fx.item({ id: "b1.grammar.but", topics: ["grammar"], term: "but", es: "pero" });
    const c = fx.card({ itemIds: [...fx.card().itemIds, extra.id] });
    const errs = validateCardReferences([withCard(c, { items: [...(f.data.items ?? []), extra] })]);
    expect(errs).toEqual([
      {
        file: "b1/grammar.json",
        path: "cards[0].itemIds[1]",
        message: 'item "b1.grammar.but" is not practiced by any of the card exercises',
      },
    ]);
  });

  it("allows an exercise in one card only", () => {
    const f = fx.cardFile();
    const second = fx.card({ id: "b1.grammar.although-again" });
    const errs = validateCardReferences([
      { ...f, data: { ...f.data, cards: [fx.card(), second] } },
    ]);
    expect(errs).toHaveLength(6);
    expect(errs[0]).toEqual({
      file: "b1/grammar.json",
      path: "cards[1].exerciseIds[0]",
      message:
        'exercise "b1.grammar.although-vocab-1" already belongs to card "b1.grammar.although"',
    });
  });
});

describe("cards in the other corpus-wide rules", () => {
  it("validateUniqueIds flags duplicate card ids", () => {
    const f = fx.cardFile();
    const errs = validateUniqueIds([{ ...f, data: { cards: [fx.card(), fx.card()] } }]);
    expect(paths(errs)).toEqual(["cards[1].id"]);
  });

  it("validateLayout checks card levels and keeps cards out of placement/ and glossary/", () => {
    const errs = validateLayout([
      withCard(fx.card(), {}, "a2/grammar.json"),
      { file: "placement/b1.json", data: { cards: [fx.card()] } },
      { file: "glossary/a.json", data: { cards: [fx.card()] } },
    ]);
    expect(errs.map((e) => `${e.file} ${e.path}`)).toEqual([
      "a2/grammar.json items[0].level",
      "a2/grammar.json exercises[0].level",
      "a2/grammar.json exercises[1].level",
      "a2/grammar.json exercises[2].level",
      "a2/grammar.json exercises[3].level",
      "a2/grammar.json exercises[4].level",
      "a2/grammar.json exercises[5].level",
      "a2/grammar.json cards[0].level",
      "placement/b1.json cards[0]",
      "glossary/a.json cards[0]",
    ]);
  });

  it("glossaryTexts lists the English text of every card and skips Spanish and wrong sentences", () => {
    const texts = glossaryTexts([
      { file: "b1/phrasal-verbs.json", data: { cards: [fx.phrasalVerbCard()] } },
      { file: "b1/vocabulary.json", data: { cards: [fx.vocabularyCard()] } },
    ]).map((t) => `${t.file} ${t.path}`);
    const common = (file: string) => [
      `${file} cards[0].pitfalls[0].right`,
      `${file} cards[0].examples[0].en`,
      `${file} cards[0].examples[1].en`,
      `${file} cards[0].examples[2].en`,
      `${file} cards[0].examples[3].en`,
    ];
    expect(texts).toEqual([
      ...common("b1/phrasal-verbs.json"),
      "b1/phrasal-verbs.json cards[0].entries[0].verb",
      "b1/phrasal-verbs.json cards[0].entries[0].example.en",
      "b1/phrasal-verbs.json cards[0].entries[1].verb",
      "b1/phrasal-verbs.json cards[0].entries[1].example.en",
      "b1/phrasal-verbs.json cards[0].entries[2].verb",
      "b1/phrasal-verbs.json cards[0].entries[2].example.en",
      ...common("b1/vocabulary.json"),
      "b1/vocabulary.json cards[0].collocations[0].en",
      "b1/vocabulary.json cards[0].falseFriend.en",
    ]);
  });

  it("does not require glossary entries for the deliberate mistakes in pitfall.wrong", () => {
    const pitfall = {
      wrong: "Although it rainned, we went out.",
      right: "Although it rained, we went out.",
      why: "Rained lleva una sola n.",
    };
    const corpus = [withCard(fx.card({ pitfalls: [pitfall] })), ...fx.glossaryFiles()];
    expect(validateCorpus(corpus)).toEqual([]);
  });

  it("validateCorpus accepts a corpus with a valid card and runs the card rules", () => {
    const corpus = [
      { file: "b1/travel.json", data: fx.validFile() },
      fx.cardFile(),
      ...fx.glossaryFiles(),
    ];
    expect(validateCorpus(corpus)).toEqual([]);
    const bad = withCard(fx.card({ id: "b1.travel.although" }));
    expect(paths(validateCorpus([bad, ...fx.glossaryFiles()]))).toContain("cards[0].id");
  });
});
