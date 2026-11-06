import type {
  Dialogue,
  DialogueCharacter,
  DialogueNode,
  DialogueOption,
  DialogueRating,
  DialogueTurnNode,
} from "@english-learn/content";
import {
  accuracy,
  expandAccepted,
  matchAnswer,
  shuffle,
  xpForAnswer,
  type Rng,
  type Verdict,
} from "@english-learn/domain";
import type { ItemOutcome, LessonSummary } from "@/features/lesson/model/lesson-session";

/**
 * The dialogue runner: a pure state machine over a dialogue's graph (`@english-learn/content`,
 * "Diálogos"). The intro waits for the learner's tap; then the NPC speaks up to the next learner
 * turn; a reply (chosen or written) shows its feedback and, on "continue", the reaction of its
 * branch; an `end` finishes it with the result. Time and randomness are injected (the option
 * order is shuffled once at the start with the given rng), so the same actions always give the
 * same states.
 */

/** One line of the conversation as the chat shows it. */
export type TranscriptLine =
  | {
      readonly kind: "npc";
      readonly nodeId: string;
      readonly speaker: DialogueCharacter;
      readonly en: string;
      readonly es: string;
    }
  | {
      readonly kind: "learner";
      readonly nodeId: string;
      /** The reply as chosen or written (trimmed). */
      readonly text: string;
      readonly rating: DialogueRating;
    };

/** A learner's reply to one turn. */
export type DialogueAnswer = {
  readonly nodeId: string;
  readonly kind: "choose" | "write";
  readonly rating: DialogueRating;
  readonly responseMs: number;
  /** The items the turn practices. */
  readonly itemIds: readonly string[];
  /** Those of them the learner looked up in the glossary before replying. */
  readonly lookedUp: readonly string[];
};

/** What the learner sees after a reply. */
export type DialogueFeedback = {
  readonly rating: DialogueRating;
  /** Spanish: why the reply works or not. */
  readonly text: string;
  /** A better reply (the turn's first good one, or the model answer), unless it was good. */
  readonly better?: string;
  /** Spanish, after a written reply that was not good. */
  readonly tip?: string;
};

export type DialogueResult = {
  /** Good replies. */
  readonly good: number;
  /** Learner turns (every path of a dialogue has the same number). */
  readonly total: number;
  /** Share of good replies (0..1), like a lesson's accuracy. */
  readonly accuracy: number;
  readonly answerXp: number;
};

type Base = {
  readonly dialogue: Dialogue;
  readonly transcript: readonly TranscriptLine[];
  readonly answers: readonly DialogueAnswer[];
  /** Items whose word the learner looked up so far. */
  readonly lookedUp: readonly string[];
  /** Per choose turn, its options in display order (shuffled once). */
  readonly optionOrder: Readonly<Record<string, readonly DialogueOption[]>>;
};

export type DialogueRunState =
  | (Base & { readonly status: "intro" })
  | (Base & { readonly status: "turn"; readonly nodeId: string })
  | (Base & {
      readonly status: "feedback";
      readonly nodeId: string;
      readonly feedback: DialogueFeedback;
      /** Where "continue" goes. */
      readonly next: string;
    })
  | (Base & {
      readonly status: "finished";
      readonly end: { readonly id: string; readonly text: string };
      readonly result: DialogueResult;
    });

export type DialogueAction =
  | { readonly type: "begin" }
  /** Picks the reply with this English text (the order on screen does not matter). */
  | { readonly type: "choose"; readonly en: string; readonly responseMs: number }
  | { readonly type: "write"; readonly text: string; readonly responseMs: number }
  | { readonly type: "continue" }
  /** The learner looked up a word matching these items (caps their review grade). */
  | { readonly type: "lookup"; readonly itemIds: readonly string[] };

const VERDICT: Readonly<Record<DialogueRating, Verdict>> = {
  good: "correct",
  ok: "almost",
  wrong: "wrong",
};

/** Feedback for a written reply, by how it matched. */
export const WRITE_FEEDBACK: Readonly<Record<DialogueRating, string>> = {
  good: "¡Bien dicho! Suena natural.",
  ok: "Casi: revisa cómo lo escribiste.",
  wrong: "No es lo que se esperaba aquí.",
};

const ratingOf = (verdict: Verdict): DialogueRating =>
  verdict === "correct" ? "good" : verdict === "almost" ? "ok" : "wrong";

function nodeById(dialogue: Dialogue, id: string): DialogueNode | undefined {
  return dialogue.nodes.find((n) => n.id === id);
}

const isTurn = (node: DialogueNode | undefined): node is DialogueTurnNode =>
  node?.kind === "choose" || node?.kind === "write";

/** Starts a dialogue on its intro; `rng` shuffles every choose turn's replies once. */
export function startDialogue(dialogue: Dialogue, rng: Rng): DialogueRunState {
  const optionOrder: Record<string, readonly DialogueOption[]> = {};
  for (const node of dialogue.nodes) {
    if (node.kind === "choose") optionOrder[node.id] = shuffle(node.options, rng);
  }
  return { status: "intro", dialogue, transcript: [], answers: [], lookedUp: [], optionOrder };
}

/** A choose turn's replies in display order. */
export function turnOptions(state: DialogueRunState, nodeId: string): readonly DialogueOption[] {
  return state.optionOrder[nodeId] ?? [];
}

/** The node the learner is replying to (on a turn or its feedback). */
export function currentTurn(state: DialogueRunState): DialogueTurnNode | undefined {
  if (state.status !== "turn" && state.status !== "feedback") return undefined;
  const node = nodeById(state.dialogue, state.nodeId);
  return isTurn(node) ? node : undefined;
}

/** The learner turns of a path (the same on every path of a valid dialogue). */
export function dialogueTurnCount(dialogue: Dialogue): number {
  let count = 0;
  const seen = new Set<string>();
  let node = nodeById(dialogue, dialogue.start);
  while (node !== undefined && node.kind !== "end" && !seen.has(node.id)) {
    seen.add(node.id);
    let next: string | undefined;
    if (node.kind === "npc") next = node.next;
    else if (node.kind === "write") next = node.next;
    else next = node.options.find((o) => o.rating === "good")?.next ?? node.options[0]?.next;
    if (isTurn(node)) count += 1;
    node = next === undefined ? undefined : nodeById(dialogue, next);
  }
  return count;
}

function resultOf(answers: readonly DialogueAnswer[]): DialogueResult {
  const verdicts = answers.map((a) => VERDICT[a.rating]);
  return {
    good: answers.filter((a) => a.rating === "good").length,
    total: answers.length,
    accuracy: accuracy(verdicts),
    answerXp: verdicts.reduce((sum, v) => sum + xpForAnswer(v), 0),
  };
}

/** Says the NPC lines from `from` on, up to the next learner turn or an end. */
function advance(base: Base, from: string): DialogueRunState {
  const transcript = [...base.transcript];
  const seen = new Set<string>();
  let node = nodeById(base.dialogue, from);
  while (node?.kind === "npc" && !seen.has(node.id)) {
    seen.add(node.id);
    const speakerId = node.speaker;
    const speaker = base.dialogue.characters.find((c) => c.id === speakerId) ?? {
      id: speakerId,
      name: speakerId,
      role: "",
    };
    transcript.push({ kind: "npc", nodeId: node.id, speaker, en: node.en, es: node.es });
    node = nodeById(base.dialogue, node.next);
  }
  const at = { ...base, transcript };
  if (node?.kind === "end") {
    return {
      ...at,
      status: "finished",
      end: { id: node.id, text: node.text },
      result: resultOf(at.answers),
    };
  }
  if (isTurn(node)) return { ...at, status: "turn", nodeId: node.id };
  // Content is validated, so this never happens; end without crashing.
  return { ...at, status: "finished", end: { id: "", text: "" }, result: resultOf(at.answers) };
}

function reply(
  state: Extract<DialogueRunState, { status: "turn" }>,
  turn: DialogueTurnNode,
  text: string,
  rating: DialogueRating,
  responseMs: number,
  feedback: DialogueFeedback,
  next: string,
): DialogueRunState {
  const itemIds = turn.itemIds ?? [];
  const answer: DialogueAnswer = {
    nodeId: turn.id,
    kind: turn.kind,
    rating,
    responseMs,
    itemIds,
    lookedUp: itemIds.filter((id) => state.lookedUp.includes(id)),
  };
  return {
    ...state,
    status: "feedback",
    transcript: [...state.transcript, { kind: "learner", nodeId: turn.id, text, rating }],
    answers: [...state.answers, answer],
    feedback,
    next,
  };
}

const withoutCommas = (text: string) => text.replace(/\s*,\s*/gu, " ");
const strippedCache = new WeakMap<readonly string[], readonly string[]>();

/**
 * Grades a written reply like a translate-write answer (`matchAnswer`: case, final punctuation,
 * contractions and typos), but a missing or extra comma never counts: in a conversation
 * "Sure here you are" is as right as "Sure, here you are". `closest` keeps its commas.
 */
export function matchReply(text: string, accepted: readonly string[]) {
  const sentences = expandAccepted(accepted);
  let stripped = strippedCache.get(sentences);
  if (stripped === undefined) {
    stripped = sentences.map(withoutCommas);
    strippedCache.set(sentences, stripped);
  }
  const match = matchAnswer(withoutCommas(text), stripped);
  const index = stripped.indexOf(match.closest);
  return { ...match, closest: index >= 0 ? sentences[index]! : match.closest };
}

export function dialogueReducer(state: DialogueRunState, action: DialogueAction): DialogueRunState {
  switch (action.type) {
    case "begin":
      return state.status === "intro" ? advance(state, state.dialogue.start) : state;
    case "lookup": {
      if (state.status === "finished") return state;
      const added = action.itemIds.filter((id) => !state.lookedUp.includes(id));
      return added.length === 0 ? state : { ...state, lookedUp: [...state.lookedUp, ...added] };
    }
    case "continue":
      return state.status === "feedback" ? advance(state, state.next) : state;
    case "choose": {
      if (state.status !== "turn") return state;
      const turn = currentTurn(state);
      if (turn?.kind !== "choose") return state;
      const option = turn.options.find((o) => o.en === action.en);
      if (option === undefined) return state;
      const best = turn.options.find((o) => o.rating === "good");
      const feedback: DialogueFeedback = {
        rating: option.rating,
        text: option.feedback,
        ...(option.rating !== "good" && best !== undefined ? { better: best.en } : {}),
      };
      return reply(state, turn, option.en, option.rating, action.responseMs, feedback, option.next);
    }
    case "write": {
      if (state.status !== "turn") return state;
      const turn = currentTurn(state);
      const text = action.text.trim();
      if (turn?.kind !== "write" || text === "") return state;
      const match = matchReply(text, turn.accepted);
      const rating = ratingOf(match.verdict);
      const model = rating === "ok" ? match.closest : expandAccepted(turn.accepted)[0];
      const feedback: DialogueFeedback = {
        rating,
        text: WRITE_FEEDBACK[rating],
        ...(rating !== "good" && model !== undefined ? { better: model } : {}),
        ...(rating !== "good" && turn.tip !== undefined ? { tip: turn.tip } : {}),
      };
      const next = rating === "wrong" ? (turn.wrongNext ?? turn.next) : turn.next;
      return reply(state, turn, text, rating, action.responseMs, feedback, next);
    }
  }
}

/** Expected time of a reply: reading the options, or writing a sentence (like the lesson types). */
const EXERCISE_TYPE = { choose: "translation_choice", write: "translate_write" } as const;

/**
 * A finished dialogue as the lesson summary `completeSession` saves: the dialogue id as the
 * lesson id, one verdict per reply (good → correct, ok → almost, wrong → wrong), the accuracy,
 * the answer XP and one outcome per item a turn practices (its review grade).
 */
export function dialogueSessionSummary(
  state: Extract<DialogueRunState, { status: "finished" }>,
): LessonSummary {
  const verdicts = state.answers.map((a) => VERDICT[a.rating]);
  const itemOutcomes: ItemOutcome[] = state.answers.flatMap((a) =>
    a.itemIds.map((itemId) => ({
      itemId,
      exerciseType: EXERCISE_TYPE[a.kind],
      verdict: VERDICT[a.rating],
      responseMs: a.responseMs,
      ...(a.lookedUp.includes(itemId) ? { lookedUp: true } : {}),
    })),
  );
  return {
    lessonId: state.dialogue.id,
    verdicts,
    accuracy: state.result.accuracy,
    answerXp: state.result.answerXp,
    itemOutcomes,
  };
}
