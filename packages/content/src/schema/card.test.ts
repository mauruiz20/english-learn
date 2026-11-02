import { describe, expect, it } from "vitest";
import { CARD_TOPIC_BY_KIND, CardSchema, ContentFileSchema } from "./index";
import * as fx from "../testing/fixtures";

const ok = (value: unknown) => CardSchema.safeParse(value).success;

describe("CardSchema", () => {
  it("accepts a grammar, a phrasal-verb and a vocabulary card", () => {
    expect(ok(fx.card())).toBe(true);
    expect(ok(fx.phrasalVerbCard())).toBe(true);
    expect(ok(fx.vocabularyCard())).toBe(true);
  });

  it("maps every kind to its topic", () => {
    expect(CARD_TOPIC_BY_KIND).toEqual({
      grammar: "grammar",
      phrasal_verbs: "phrasal-verbs",
      vocabulary: "vocabulary",
    });
  });

  it("rejects a topic that does not belong to the kind, and unknown kinds", () => {
    expect(ok({ ...fx.card(), topic: "vocabulary" })).toBe(false);
    expect(ok({ ...fx.vocabularyCard(), topic: "grammar" })).toBe(false);
    expect(ok({ ...fx.card(), kind: "idioms" })).toBe(false);
  });

  it("rejects ids that do not look like level.topic.slug and unknown keys", () => {
    expect(ok({ ...fx.card(), id: "grammar.although" })).toBe(false);
    expect(ok({ ...fx.card(), extra: 1 })).toBe(false);
  });

  it("needs 1-4 uses, 0-4 pitfalls and 4-8 examples", () => {
    const pitfall = fx.card().pitfalls[0];
    const example = { en: "We went out.", es: "Salimos." };
    expect(ok({ ...fx.card(), uses: [] })).toBe(false);
    expect(ok({ ...fx.card(), uses: ["a", "b", "c", "d", "e"] })).toBe(false);
    expect(ok({ ...fx.card(), pitfalls: [] })).toBe(true);
    expect(ok({ ...fx.card(), pitfalls: Array(5).fill(pitfall) })).toBe(false);
    expect(ok({ ...fx.card(), examples: Array(3).fill(example) })).toBe(false);
    expect(ok({ ...fx.card(), examples: Array(9).fill(example) })).toBe(false);
  });

  it("needs at least one item and 6-8 exercises", () => {
    const ids = fx.card().exerciseIds;
    expect(ok({ ...fx.card(), itemIds: [] })).toBe(false);
    expect(ok({ ...fx.card(), exerciseIds: ids.slice(0, 5) })).toBe(false);
    expect(ok({ ...fx.card(), exerciseIds: [...ids, "b1.grammar.x", "b1.grammar.y"] })).toBe(true);
    expect(
      ok({ ...fx.card(), exerciseIds: [...ids, "b1.grammar.x", "b1.grammar.y", "b1.grammar.z"] }),
    ).toBe(false);
  });

  it("requires 3-6 entries on phrasal-verb cards and allows them nowhere else", () => {
    const card = fx.phrasalVerbCard();
    const entries = card.kind === "phrasal_verbs" ? card.entries : [];
    expect(ok({ ...card, entries: entries.slice(0, 2) })).toBe(false);
    expect(ok({ ...card, entries: [...entries, ...entries, entries[0]] })).toBe(false);
    const { entries: _entries, ...withoutEntries } = card as typeof card & { entries: unknown };
    expect(ok(withoutEntries)).toBe(false);
    expect(ok({ ...fx.card(), entries })).toBe(false);
  });

  it("requires a boolean separable and a bilingual example on each entry", () => {
    const card = fx.phrasalVerbCard();
    const [first, ...rest] = card.kind === "phrasal_verbs" ? card.entries : [];
    expect(ok({ ...card, entries: [{ ...first, separable: "yes" }, ...rest] })).toBe(false);
    expect(ok({ ...card, entries: [{ ...first, example: { en: "x" } }, ...rest] })).toBe(false);
  });

  it("allows collocations and a false friend only on vocabulary cards, both optional", () => {
    const { collocations, falseFriend, ...plain } = fx.vocabularyCard() as ReturnType<
      typeof fx.vocabularyCard
    > & { collocations: unknown; falseFriend: unknown };
    expect(ok(plain)).toBe(true);
    expect(ok({ ...fx.card(), collocations })).toBe(false);
    expect(ok({ ...fx.card(), falseFriend })).toBe(false);
    expect(ok({ ...plain, collocations: [] })).toBe(false);
    expect(ok({ ...plain, falseFriend: { en: "late", looksLike: "lato" } })).toBe(false);
  });

  it("applies NonEmptyString to every text field", () => {
    const pad = " x";
    const card = fx.card();
    const pitfall = card.pitfalls[0];
    const example = card.examples[0];
    const bad: unknown[] = [
      { ...card, title: pad },
      { ...card, summary: pad },
      { ...card, form: pad },
      { ...card, uses: [pad] },
      { ...card, pitfalls: [{ ...pitfall, wrong: pad }] },
      { ...card, pitfalls: [{ ...pitfall, right: pad }] },
      { ...card, pitfalls: [{ ...pitfall, why: pad }] },
      { ...card, examples: [{ ...example, en: pad }, ...card.examples.slice(1)] },
      { ...card, examples: [{ ...example, es: pad }, ...card.examples.slice(1)] },
    ];
    for (const value of bad) expect(ok(value)).toBe(false);
  });

  it("is allowed in a content file", () => {
    expect(ContentFileSchema.safeParse({ cards: [fx.card()] }).success).toBe(true);
  });
});
