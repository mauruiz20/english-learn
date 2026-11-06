import { corpus } from "@english-learn/content/corpus";
import {
  practiceCollectionBySlug,
  practiceCollectionRows,
  practiceGroupRows,
} from "@/features/practice/model/practice-catalog";
import {
  dialoguePlace,
  dialogueRecap,
  dialogueScore,
  dialogueScoreDescription,
  dialogueScoreText,
} from "./dialogue-catalog";
import { DIALOGUE_ID, dialogue, dialogueContent } from "./fixtures";

describe("dialogue scores", () => {
  it("counts the best result over the dialogue's learner turns", () => {
    expect(dialogueScore(dialogue, undefined)).toBeUndefined();
    expect(
      dialogueScore(dialogue, { lessonId: DIALOGUE_ID, bestAccuracy: 0.6, completions: 1 }),
    ).toEqual({ correct: 3, total: 5, perfect: false });
  });

  it("reads like a lesson's marker, in the masculine", () => {
    const perfect = { correct: 6, total: 6, perfect: true };
    const missed = { correct: 5, total: 6, perfect: false };
    expect(dialogueScoreText(perfect)).toBe("Perfecto · 6/6");
    expect(dialogueScoreText(missed)).toBe("Completado · 5/6");
    expect(dialogueScoreDescription(perfect)).toBe(
      "completado sin errores: 6 de 6 respuestas buenas",
    );
    expect(dialogueScoreDescription(missed)).toBe(
      "completado con errores: 5 de 6 respuestas buenas",
    );
  });
});

describe("dialoguePlace", () => {
  it("finds the collection a dialogue belongs to", () => {
    expect(dialoguePlace(dialogueContent, DIALOGUE_ID)).toEqual({
      slug: "dialogues",
      collectionTitle: "Diálogos",
      groupTitle: "Fuera de casa",
    });
    expect(dialoguePlace(dialogueContent, "a2.dialogues.nope")).toBeUndefined();
  });
});

describe("dialogueRecap", () => {
  it("lists the items its turns practice, with the reply that used them", () => {
    expect(dialogueRecap(dialogue, dialogueContent)).toEqual([
      {
        id: "a2.situations.ill-have",
        term: "I'll have (the soup)",
        es: "para mí (la sopa)",
        example: { en: "Hi! Can I see the menu?" },
      },
      {
        id: "a2.situations.for-here-or-to-go",
        term: "for here or to go",
        es: "para comer aquí o para llevar",
        example: { en: "Can I have a coffee to go?" },
      },
    ]);
  });

  it("links the dialogue's study cards", () => {
    const withCard = { ...dialogue, cardIds: ["a2.grammar.some-any"] };
    const recap = dialogueRecap(withCard, corpus);
    expect(recap.at(-1)).toMatchObject({
      id: "a2.grammar.some-any",
      card: { id: "a2.grammar.some-any", title: "Some, any y I would like" },
    });
  });
});

describe("dialogues in Práctica libre", () => {
  it("counts a dialogue collection in dialogues", () => {
    const rows = practiceCollectionRows(dialogueContent, [
      { lessonId: DIALOGUE_ID, bestAccuracy: 1, completions: 1 },
    ]);
    expect(rows).toEqual([
      {
        slug: "dialogues",
        title: "Diálogos",
        summary: "Conversaciones que cambian según lo que respondas.",
        groups: 1,
        lessons: 1,
        done: 1,
        kind: "dialogues",
      },
    ]);
  });

  it("lists a group's dialogues with their best result", () => {
    const collection = practiceCollectionBySlug(dialogueContent, "dialogues")!;
    const [group] = practiceGroupRows(collection, dialogueContent, [
      { lessonId: DIALOGUE_ID, bestAccuracy: 1, completions: 1 },
    ]);
    expect(group).toMatchObject({ id: "practice.dialogues.everyday", level: "A2", verbs: [] });
    expect(group!.lessons).toEqual([
      {
        id: DIALOGUE_ID,
        number: 1,
        title: "En la cafetería",
        fullTitle: "En la cafetería",
        kind: "dialogue",
        score: { correct: 5, total: 5, perfect: true },
      },
    ]);
  });

  it("bundles the Diálogos collection with ten dialogues from A2 to B2", () => {
    const collection = practiceCollectionBySlug(corpus, "dialogues");
    expect(collection?.title).toBe("Diálogos");
    const groups = practiceGroupRows(collection!, corpus, []);
    expect(groups.map((g) => g.level)).toEqual(["A2", "B1", "B2"]);
    expect(groups.flatMap((g) => g.lessons)).toHaveLength(10);
  });
});
