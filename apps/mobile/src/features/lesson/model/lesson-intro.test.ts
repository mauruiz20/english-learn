import { createCorpus, type Card, type Lesson, type LessonIntro } from "@english-learn/content";
import { card, lesson } from "./fixtures";
import { lessonIntro } from "./lesson-intro";

const written: LessonIntro = {
  points: ["«Wake up» es despertarse.", "«Get up» es levantarse."],
  examples: [{ en: "I wake up at six.", es: "Me despierto a las seis." }],
  mistake: { wrong: "I wake at six.", right: "I wake up at six.", note: "Falta «up»." },
};

const grammarCard: Card = {
  ...card,
  id: "a2.grammar.routine",
  topic: "grammar",
  kind: "grammar",
  title: "Presente simple",
  uses: ["Rutinas.", "Hechos.", "Horarios.", "Gustos."],
  pitfalls: [
    { wrong: "She wake up.", right: "She wakes up.", why: "Con she, el verbo lleva -s." },
    { wrong: "He go.", right: "He goes.", why: "Go pasa a goes." },
  ],
} as Card;

const contentWith = (cards: readonly Card[]) => createCorpus([{ cards: [...cards] }]);

describe("lessonIntro", () => {
  it("uses the lesson's own intro", () => {
    const withIntro: Lesson = { ...lesson, intro: written, deepenCardIds: [card.id] };
    expect(lessonIntro(withIntro, contentWith([card]))).toEqual(written);
  });

  it("derives one from the first linked card: three uses, one example, the first pitfall", () => {
    const linked: Lesson = { ...lesson, deepenCardIds: ["a2.grammar.missing", grammarCard.id] };
    expect(lessonIntro(linked, contentWith([grammarCard]))).toEqual({
      points: ["Rutinas.", "Hechos.", "Horarios."],
      examples: [grammarCard.examples[0]],
      mistake: {
        wrong: "She wake up.",
        right: "She wakes up.",
        note: "Con she, el verbo lleva -s.",
      },
    });
  });

  it("derives one without a mistake from a card with no pitfalls", () => {
    const noPitfalls = { ...grammarCard, pitfalls: [] } as Card;
    const linked: Lesson = { ...lesson, deepenCardIds: [noPitfalls.id] };
    expect(lessonIntro(linked, contentWith([noPitfalls]))).toEqual({
      points: ["Rutinas.", "Hechos.", "Horarios."],
      examples: [grammarCard.examples[0]],
    });
  });

  it("is null for a lesson with neither an intro nor a linked card", () => {
    expect(lessonIntro(lesson, contentWith([card]))).toBeNull();
    expect(
      lessonIntro({ ...lesson, deepenCardIds: ["a2.grammar.missing"] }, contentWith([])),
    ).toBeNull();
  });
});
