/**
 * Valid fixture builders for tests. Fixtures live here (never in data/).
 * Each builder returns a fully valid object; tests override single fields to
 * make it invalid.
 */
import type {
  ClozeExercise,
  ContentFile,
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
    es: "Aunque llovia, salimos.",
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
    tokens: ["we", "went", "out", "although", "it", "rained."],
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
    es: "Aunque estaba cansado, siguio caminando.",
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
