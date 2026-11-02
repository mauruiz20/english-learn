/**
 * Valid fixture builders for tests. Fixtures live here (never in data/).
 * Each builder returns a fully valid object; tests override single fields to
 * make it invalid.
 */
import type { LoadedFile } from "../validate/types";
import type {
  Card,
  ClozeExercise,
  ContentFile,
  GlossaryEntry,
  Item,
  Lesson,
  Passage,
  PlacementQuestion,
  ReadingExercise,
  TranslateWriteExercise,
  TranslationChoiceExercise,
  VocabExercise,
  WordOrderExercise,
} from "../schema";

const original = { kind: "original" } as const;

export function item(o: Partial<Item> = {}): Item {
  return {
    id: "b1.travel.although",
    level: "B1",
    topics: ["travel"],
    kind: "word",
    term: "although",
    es: "aunque",
    ...o,
  };
}

export function vocab(o: Partial<VocabExercise> = {}): VocabExercise {
  return {
    id: "b1.travel.vocab-001",
    itemIds: ["b1.travel.although"],
    level: "B1",
    source: original,
    type: "vocab",
    prompt: "Choose the best meaning of 'although'.",
    options: ["aunque", "porque", "mientras"],
    answerIndex: 0,
    ...o,
  };
}

export function cloze(o: Partial<ClozeExercise> = {}): ClozeExercise {
  return {
    id: "b1.travel.cloze-001",
    itemIds: ["b1.travel.although"],
    level: "B1",
    source: original,
    type: "cloze",
    sentence: "___ it was raining, we went out.",
    answers: ["Although"],
    distractors: ["Because", "Unless"],
    es: "Aunque llovía, salimos.",
    ...o,
  };
}

export function wordOrder(o: Partial<WordOrderExercise> = {}): WordOrderExercise {
  return {
    id: "b1.travel.order-001",
    itemIds: ["b1.travel.although"],
    level: "B1",
    source: original,
    type: "word_order",
    tokens: ["although", "we", "rained.", "went", "it", "out"],
    accepted: ["we went out although it rained."],
    ...o,
  };
}

export function translationChoice(
  o: Partial<TranslationChoiceExercise> = {},
): TranslationChoiceExercise {
  return {
    id: "b1.travel.tchoice-001",
    itemIds: ["b1.travel.although"],
    level: "B1",
    source: original,
    type: "translation_choice",
    sentence: "Although it was late, we kept walking.",
    options: ["Aunque era tarde, seguimos caminando.", "Era tarde.", "Seguimos caminando."],
    answerIndex: 0,
    ...o,
  };
}

export function reading(o: Partial<ReadingExercise> = {}): ReadingExercise {
  return {
    id: "b1.travel.reading-001",
    itemIds: ["b1.travel.although"],
    level: "B1",
    source: original,
    type: "reading",
    passageId: "b1.travel.trip",
    questions: [
      { prompt: "Where did they go?", options: ["Lisbon", "Madrid", "Paris"], answerIndex: 0 },
    ],
    ...o,
  };
}

export function translateWrite(o: Partial<TranslateWriteExercise> = {}): TranslateWriteExercise {
  return {
    id: "b1.travel.write-001",
    itemIds: ["b1.travel.although"],
    level: "B1",
    source: original,
    type: "translate_write",
    es: "Aunque estaba cansado, siguió caminando.",
    accepted: ["Although he was tired, he kept walking."],
    ...o,
  };
}

export function passage(o: Partial<Passage> = {}): Passage {
  return {
    id: "b1.travel.trip",
    level: "B1",
    topics: ["travel"],
    title: "A short trip",
    text: "We went to Lisbon last summer.",
    source: original,
    ...o,
  };
}

export function lesson(o: Partial<Lesson> = {}): Lesson {
  return {
    id: "b1.travel.lesson-001",
    level: "B1",
    topic: "travel",
    title: "De viaje",
    exerciseIds: [
      "b1.travel.vocab-001",
      "b1.travel.cloze-001",
      "b1.travel.order-001",
      "b1.travel.tchoice-001",
      "b1.travel.write-001",
    ],
    ...o,
  };
}

export function placementQuestion(o: Partial<PlacementQuestion> = {}): PlacementQuestion {
  return {
    id: "placement.b1.001",
    level: "B1",
    exercise: {
      source: original,
      type: "vocab",
      prompt: "Choose the best meaning of 'although'.",
      options: ["aunque", "porque", "mientras"],
      answerIndex: 0,
    },
    ...o,
  };
}

/** A complete, valid B1 corpus file that satisfies every semantic rule. */
export function validFile(): ContentFile {
  return {
    items: [item()],
    exercises: [vocab(), cloze(), wordOrder(), translationChoice(), translateWrite(), reading()],
    passages: [passage()],
    lessons: [lesson()],
  };
}

export function glossaryEntry(o: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    id: "glossary.although",
    headword: "although",
    kind: "word",
    forms: ["although"],
    senses: [{ es: "aunque", pos: "conjunction" }],
    ...o,
  };
}

/** [headword, forms (headword first), Spanish] for every word in `validFile()`. */
const FIXTURE_GLOSSARY: readonly (readonly [string, readonly string[], string])[] = [
  ["a", ["a"], "un, una"],
  ["although", ["although"], "aunque"],
  ["be", ["be", "was"], "ser, estar"],
  ["because", ["because"], "porque"],
  ["best", ["best"], "mejor"],
  ["choose", ["choose"], "elegir"],
  ["do", ["do", "did"], "hacer"],
  ["go", ["go", "went"], "ir"],
  ["go out", ["go out", "went out"], "salir"],
  ["he", ["he"], "él"],
  ["it", ["it"], "eso, ello"],
  ["keep", ["keep", "kept"], "seguir, mantener"],
  ["last", ["last"], "pasado, último"],
  ["late", ["late"], "tarde"],
  ["Lisbon", ["lisbon"], "Lisboa"],
  ["Madrid", ["madrid"], "Madrid"],
  ["meaning", ["meaning"], "significado"],
  ["of", ["of"], "de"],
  ["out", ["out"], "afuera"],
  ["Paris", ["paris"], "París"],
  ["rain", ["rain", "rained", "raining"], "llover"],
  ["short", ["short"], "corto"],
  ["summer", ["summer"], "verano"],
  ["the", ["the"], "el, la, los, las"],
  ["they", ["they"], "ellos, ellas"],
  ["tired", ["tired"], "cansado"],
  ["to", ["to"], "a"],
  ["trip", ["trip"], "viaje"],
  ["unless", ["unless"], "a menos que"],
  ["walk", ["walk", "walking"], "caminar"],
  ["we", ["we"], "nosotros"],
  ["where", ["where"], "dónde"],
];

/**
 * A glossary covering every English word in `validFile()` and
 * `placementQuestion()`, split into `glossary/<letter>.json` files.
 */
export function glossaryFiles(): LoadedFile[] {
  const byLetter = new Map<string, GlossaryEntry[]>();
  for (const [headword, forms, es] of FIXTURE_GLOSSARY) {
    const letter = headword[0]?.toLowerCase() ?? "";
    const list = byLetter.get(letter) ?? [];
    list.push(
      glossaryEntry({
        id: `glossary.${headword.toLowerCase().replace(/ /g, "-")}`,
        headword,
        kind: headword.includes(" ") ? "phrase" : "word",
        forms: [...forms],
        senses: [{ es }],
      }),
    );
    byLetter.set(letter, list);
  }
  return [...byLetter].map(([letter, glossary]) => ({
    file: `glossary/${letter}.json`,
    data: { glossary },
  }));
}

const CARD_ITEM_IDS = ["b1.grammar.although"];

/** A valid B1 grammar card about "although", practiced by the exercises of `cardFile()`. */
export function card(o: Partial<Card> = {}): Card {
  return {
    id: "b1.grammar.although",
    level: "B1",
    topic: "grammar",
    kind: "grammar",
    title: "Although",
    summary: "Une dos ideas que contrastan.",
    form: "although + oración",
    uses: ["Contrastar dos ideas."],
    pitfalls: [
      {
        wrong: "Although was late, we kept walking.",
        right: "Although it was late, we kept walking.",
        why: "En inglés la oración necesita sujeto: it was late.",
      },
    ],
    examples: [
      { en: "Although it was late, we kept walking.", es: "Aunque era tarde, seguimos caminando." },
      {
        en: "Although he was tired, he kept walking.",
        es: "Aunque estaba cansado, siguió caminando.",
      },
      { en: "We went out although it rained.", es: "Salimos aunque llovió." },
      { en: "Although it was raining, we went out.", es: "Aunque llovía, salimos." },
    ],
    itemIds: [...CARD_ITEM_IDS],
    exerciseIds: [
      "b1.grammar.although-vocab-1",
      "b1.grammar.although-cloze-1",
      "b1.grammar.although-cloze-2",
      "b1.grammar.although-order-1",
      "b1.grammar.although-choice-1",
      "b1.grammar.although-write-1",
    ],
    ...o,
  } as Card;
}

/** A valid B1 phrasal-verb card (three entries); not wired to items or exercises. */
export function phrasalVerbCard(o: Partial<Card> = {}): Card {
  const entry = (verb: string, es: string, separable: boolean) => ({
    verb,
    es,
    separable,
    example: { en: "We went out.", es: "Salimos." },
  });
  return {
    ...card(),
    id: "b1.phrasal-verbs.going-out",
    topic: "phrasal-verbs",
    kind: "phrasal_verbs",
    entries: [
      entry("go out", "salir", false),
      entry("keep walking", "seguir caminando", false),
      entry("rain out", "suspender por lluvia", true),
    ],
    ...o,
  } as Card;
}

/** A valid B1 vocabulary card with collocations and a false friend; not wired to items. */
export function vocabularyCard(o: Partial<Card> = {}): Card {
  return {
    ...card(),
    id: "b1.vocabulary.late",
    topic: "vocabulary",
    kind: "vocabulary",
    collocations: [{ en: "late summer", es: "fines del verano" }],
    falseFriend: { en: "late", looksLike: "lato", actually: "tarde" },
    ...o,
  } as Card;
}

/** A complete, valid `b1/grammar.json` holding a card, its item and its six exercises. */
export function cardFile(c: Card = card()): LoadedFile {
  const itemIds = [...CARD_ITEM_IDS];
  return {
    file: "b1/grammar.json",
    data: {
      items: [item({ id: "b1.grammar.although", topics: ["grammar"], kind: "grammar" })],
      exercises: [
        vocab({ id: "b1.grammar.although-vocab-1", itemIds }),
        cloze({ id: "b1.grammar.although-cloze-1", itemIds }),
        cloze({
          id: "b1.grammar.although-cloze-2",
          itemIds,
          sentence: "___ he was tired, he kept walking.",
          es: "Aunque estaba cansado, siguió caminando.",
        }),
        wordOrder({ id: "b1.grammar.although-order-1", itemIds }),
        translationChoice({ id: "b1.grammar.although-choice-1", itemIds }),
        translateWrite({ id: "b1.grammar.although-write-1", itemIds }),
      ],
      cards: [c],
    },
  };
}
