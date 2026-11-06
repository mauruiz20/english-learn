import type { Card, Exercise, Level } from "@english-learn/content";
import { expandAccepted, LEVELS, normalizeAnswer, shuffle, type Rng } from "@english-learn/domain";

/**
 * A listening exercise DERIVED from an existing one (no content of its own): the learner hears
 * the source exercise's English sentence with the device's voice and writes it ("Escucha y
 * escribe", `write`) or picks it among three sentences ("Escucha y elige", `choose`). It practices
 * the same items as its source (`itemIds`), so it can stand in for it in a session.
 */
export type ListenExercise = {
  readonly type: "listen";
  readonly mode: "write" | "choose";
  /** `<sourceId>~listen`: never a content id (those have no `~`). */
  readonly id: string;
  /** The exercise it was made from (study cards and topics are looked up by it). */
  readonly sourceId: string;
  readonly itemIds: readonly string[];
  readonly level: Level;
  /** What the voice says (and the answer shown after checking). */
  readonly sentence: string;
  /** write: every accepted sentence (the source's variants), matched like translate-write. */
  readonly answers: readonly string[];
  /** choose: the sentence heard, then two others (shuffled when prepared); write: none. */
  readonly options: readonly string[];
};

/** What a session runs: content exercises, and listening exercises made from them. */
export type SessionExercise = Exercise | ListenExercise;

export const isListenExercise = (exercise: SessionExercise): exercise is ListenExercise =>
  exercise.type === "listen";

/** The content id behind a session exercise (a listening exercise's source). */
export const contentExerciseId = (exercise: SessionExercise): string =>
  isListenExercise(exercise) ? exercise.sourceId : exercise.id;

/** At most this many listening exercises per session (and one in sessions under 6 exercises). */
export const MAX_LISTENING_PER_SESSION = 2;
const SESSION_FOR_TWO = 6;

/** Sentences short enough to hold in mind and long enough to be a sentence. */
const MIN_WORDS = 3;
const MAX_WORDS = 14;

const wordCount = (text: string) => text.trim().split(/\s+/u).length;

/** Digits are said as words ("11" → "eleven"), which a dictation could not expect. */
const speakableSentence = (text: string) => {
  const words = wordCount(text);
  return words >= MIN_WORDS && words <= MAX_WORDS && !/\d/u.test(text);
};

/**
 * The sentence a listening exercise can be made from, with every sentence that answers it: a
 * word_order sentence (its accepted orders), or a translate_write reference answer (every sentence
 * its patterns stand for). Null for other types and for sentences that do not suit listening.
 */
export function listenSource(
  exercise: Exercise,
): { readonly sentence: string; readonly answers: readonly string[] } | null {
  let answers: readonly string[];
  if (exercise.type === "word_order") answers = exercise.accepted;
  else if (exercise.type === "translate_write") answers = expandAccepted(exercise.accepted);
  else return null;
  const sentence = answers[0];
  if (sentence === undefined || !speakableSentence(sentence)) return null;
  return { sentence, answers };
}

export type PoolSentence = { readonly text: string; readonly level: Level };

const poolCache = new WeakMap<readonly Exercise[], readonly PoolSentence[]>();

/**
 * English sentences that can be offered next to the one heard ("Escucha y elige"): word_order
 * sentences, translate_write reference answers and study card examples, once each. Built once per
 * corpus.
 */
export function listeningPool({
  exercises,
  cards,
}: {
  exercises: readonly Exercise[];
  cards: readonly Card[];
}): readonly PoolSentence[] {
  const cached = poolCache.get(exercises);
  if (cached !== undefined) return cached;
  const seen = new Set<string>();
  const pool: PoolSentence[] = [];
  const add = (text: string | undefined, level: Level) => {
    if (text === undefined || !speakableSentence(text)) return;
    const key = normalizeAnswer(text);
    if (seen.has(key)) return;
    seen.add(key);
    pool.push({ text, level });
  };
  for (const exercise of exercises) add(listenSource(exercise)?.sentence, exercise.level);
  for (const card of cards) for (const example of card.examples) add(example.en, card.level);
  poolCache.set(exercises, pool);
  return pool;
}

const levelGap = (a: Level, b: Level) => Math.abs(LEVELS.indexOf(a) - LEVELS.indexOf(b));

/** How many close sentences the two distractors are picked from. */
const DISTRACTOR_SHORTLIST = 8;

/**
 * Two sentences of the pool to offer with the one heard: of its level or the nearest, about as
 * long, never one of its answers; picked with `rng` among the closest few.
 */
function distractors(
  sentence: string,
  answers: readonly string[],
  level: Level,
  pool: readonly PoolSentence[],
  rng: Rng,
): string[] {
  const excluded = new Set(answers.map(normalizeAnswer));
  const words = wordCount(sentence);
  const candidates = pool
    .filter((s) => !excluded.has(normalizeAnswer(s.text)))
    .map((s) => ({
      s,
      level: levelGap(s.level, level),
      length: Math.abs(wordCount(s.text) - words),
    }))
    .sort((a, b) => a.level - b.level || a.length - b.length || (a.s.text < b.s.text ? -1 : 1))
    .slice(0, DISTRACTOR_SHORTLIST)
    .map(({ s }) => s.text);
  return shuffle(candidates, rng).slice(0, 2);
}

function toListen(
  exercise: Exercise,
  mode: ListenExercise["mode"],
  pool: readonly PoolSentence[],
  rng: Rng,
): ListenExercise | null {
  const source = listenSource(exercise);
  if (source === null) return null;
  const base = {
    type: "listen",
    id: `${exercise.id}~listen`,
    sourceId: exercise.id,
    itemIds: exercise.itemIds,
    level: exercise.level,
    sentence: source.sentence,
    answers: source.answers,
  } as const;
  if (mode === "choose") {
    const others = distractors(source.sentence, source.answers, exercise.level, pool, rng);
    if (others.length === 2) return { ...base, mode, options: [source.sentence, ...others] };
  }
  return { ...base, mode: "write", options: [] };
}

/**
 * Mixes listening into a session WITHOUT adding exercises: up to `MAX_LISTENING_PER_SESSION`
 * exercises that have a sentence to hear (one in sessions under 6 exercises; never the first, a
 * familiar start) are replaced by a listening exercise made from them, the first a dictation, the
 * second a choice. The count, order and items stay the same, so every item is still practiced
 * once and the review's count on home stays right. `rng` decides which (deterministic per seed).
 */
export function mixListening(
  exercises: readonly Exercise[],
  { pool, rng }: { pool: readonly PoolSentence[]; rng: Rng },
): SessionExercise[] {
  const limit = exercises.length >= SESSION_FOR_TWO ? MAX_LISTENING_PER_SESSION : 1;
  const candidates = exercises.flatMap((exercise, i) =>
    (i > 0 || exercises.length === 1) && listenSource(exercise) !== null ? [i] : [],
  );
  const chosen = shuffle(candidates, rng)
    .slice(0, limit)
    .sort((a, b) => a - b);
  const mixed: SessionExercise[] = [...exercises];
  chosen.forEach((index, order) => {
    const exercise = exercises[index];
    if (exercise === undefined) return;
    const listen = toListen(exercise, order === 0 ? "write" : "choose", pool, rng);
    if (listen !== null) mixed[index] = listen;
  });
  return mixed;
}
