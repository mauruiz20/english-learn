import { corpus } from "@english-learn/content/corpus";
import { expandAccepted, xpForAnswer } from "@english-learn/domain";
import {
  dialogueReducer,
  dialogueSessionSummary,
  dialogueTurnCount,
  startDialogue,
  turnOptions,
  type DialogueAction,
  type DialogueRunState,
} from "./dialogue-runner";
import { dialogue } from "./fixtures";

/** A fixed rng: the option order is deterministic per seed. */
const seeded = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

const run = (state: DialogueRunState, actions: readonly DialogueAction[]) =>
  actions.reduce(dialogueReducer, state);

const choose = (en: string, responseMs = 1000): DialogueAction => ({
  type: "choose",
  en,
  responseMs,
});
const write = (text: string, responseMs = 1000): DialogueAction => ({
  type: "write",
  text,
  responseMs,
});
const next: DialogueAction = { type: "continue" };

const ALL_GOOD: readonly DialogueAction[] = [
  { type: "begin" },
  choose("Hi! Can I see the menu?"),
  next,
  write("Could I get a coffee to go, please?"),
  next,
  choose("Large, please."),
  next,
  write("can i pay by card"),
  next,
  choose("Thanks! Have a nice day."),
  next,
];

const npcLines = (state: DialogueRunState) =>
  state.transcript.filter((l) => l.kind === "npc").map((l) => l.en);

describe("startDialogue", () => {
  it("waits on the intro with an empty transcript", () => {
    const state = startDialogue(dialogue, seeded(1));
    expect(state.status).toBe("intro");
    expect(state.transcript).toEqual([]);
    expect(state.answers).toEqual([]);
  });

  it("shuffles each choose turn's replies once, deterministically for an rng", () => {
    const a = startDialogue(dialogue, seeded(7));
    const b = startDialogue(dialogue, seeded(7));
    expect(turnOptions(a, "ready")).toEqual(turnOptions(b, "ready"));
    expect([...turnOptions(a, "ready")].map((o) => o.en).sort()).toEqual([
      "Hi! Can I see the menu?",
      "I'm fine, thanks.",
      "Menu.",
    ]);
    const orders = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
        turnOptions(startDialogue(dialogue, seeded(seed)), "ready")
          .map((o) => o.en)
          .join("|"),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe("dialogueReducer", () => {
  it("plays the NPC lines up to the first learner turn when it begins", () => {
    const state = run(startDialogue(dialogue, seeded(1)), [{ type: "begin" }]);
    expect(state).toMatchObject({ status: "turn", nodeId: "ready" });
    expect(state.transcript).toEqual([
      {
        kind: "npc",
        nodeId: "hello",
        speaker: { id: "server", name: "Mia", role: "mesera" },
        en: "Hi! What can I get you?",
        es: "¡Hola! ¿Qué te sirvo?",
      },
    ]);
  });

  it("shows feedback after a reply, then the NPC reaction of that branch", () => {
    const good = run(startDialogue(dialogue, seeded(1)), [{ type: "begin" }, choose("Menu.")]);
    expect(good).toMatchObject({
      status: "feedback",
      feedback: {
        rating: "ok",
        text: "Suena seco.",
        better: "Hi! Can I see the menu?",
      },
    });
    expect(good.transcript.at(-1)).toEqual({
      kind: "learner",
      nodeId: "ready",
      text: "Menu.",
      rating: "ok",
    });
    expect(npcLines(dialogueReducer(good, next)).at(-1)).toBe("Sure, here you go.");

    const wrong = run(startDialogue(dialogue, seeded(1)), [
      { type: "begin" },
      choose("I'm fine, thanks."),
      next,
    ]);
    expect(npcLines(wrong).at(-1)).toBe("Ha, good! Here's the menu.");
    expect(wrong).toMatchObject({ status: "turn", nodeId: "order" });
  });

  it("gives no better reply after a good one", () => {
    const state = run(startDialogue(dialogue, seeded(1)), [
      { type: "begin" },
      choose("Hi! Can I see the menu?"),
    ]);
    expect(state).toMatchObject({ status: "feedback", feedback: { rating: "good" } });
    expect(state.status === "feedback" && state.feedback.better).toBeUndefined();
  });

  it("grades a written reply with the answer patterns: good, almost (ok) or wrong", () => {
    const at = run(startDialogue(dialogue, seeded(1)), [
      { type: "begin" },
      choose("Hi! Can I see the menu?"),
      next,
    ]);

    const good = dialogueReducer(at, write("can I have a coffee to go please"));
    expect(good).toMatchObject({ status: "feedback", feedback: { rating: "good" } });

    const almost = dialogueReducer(at, write("Can I have a cofee to go, please?"));
    expect(almost).toMatchObject({
      status: "feedback",
      feedback: { rating: "ok", better: "Can I have a coffee to go, please?" },
    });

    const wrong = dialogueReducer(at, write("I want coffee"));
    expect(wrong).toMatchObject({
      status: "feedback",
      feedback: {
        rating: "wrong",
        better: "Can I have a coffee to go?",
        tip: "«To go» es «para llevar».",
      },
    });
    expect(wrong.transcript.at(-1)).toMatchObject({ kind: "learner", text: "I want coffee" });
    // A wrong reply takes the write turn's `wrongNext`.
    expect(npcLines(dialogueReducer(wrong, next)).at(-1)).toBe("Sorry, a coffee? Small or large?");
    expect(npcLines(dialogueReducer(almost, next)).at(-1)).toBe("Small or large?");
  });

  it("ignores empty writing, unknown replies and actions out of turn", () => {
    const at = run(startDialogue(dialogue, seeded(1)), [{ type: "begin" }]);
    expect(dialogueReducer(at, write("   "))).toBe(at);
    expect(dialogueReducer(at, choose("Not a reply."))).toBe(at);
    expect(dialogueReducer(at, write("A coffee to go, please."))).toBe(at);
    expect(dialogueReducer(at, next)).toBe(at);
    expect(dialogueReducer(at, { type: "begin" })).toBe(at);
  });

  it("finishes at an end with the score of good replies", () => {
    const state = run(startDialogue(dialogue, seeded(3)), ALL_GOOD);
    expect(state.status).toBe("finished");
    if (state.status !== "finished") return;
    expect(state.end).toEqual({ id: "end", text: "Tienes tu café para llevar." });
    expect(state.result).toMatchObject({ good: 5, total: 5, accuracy: 1 });
    expect(npcLines(state).at(-1)).toBe("Sure. Here's your coffee!");
  });

  it("reaches the other ending on another branch, with the same number of turns", () => {
    const state = run(startDialogue(dialogue, seeded(3)), [
      { type: "begin" },
      choose("I'm fine, thanks."),
      next,
      write("coffee"),
      next,
      choose("Give me a big one."),
      next,
      write("Can I pay by card?"),
      next,
      choose("You're welcome."),
      next,
    ]);
    expect(state.status === "finished" && state.end.id).toBe("end-odd");
    expect(state.status === "finished" && state.result).toMatchObject({
      good: 1,
      total: 5,
      accuracy: 0.2,
    });
  });

  it("is deterministic: the same actions give the same states", () => {
    const a = run(startDialogue(dialogue, seeded(9)), ALL_GOOD);
    const b = run(startDialogue(dialogue, seeded(9)), ALL_GOOD);
    expect(a).toEqual(b);
  });
});

describe("dialogueSessionSummary", () => {
  it("saves the dialogue as a lesson: verdicts, accuracy, answer XP and item outcomes", () => {
    const state = run(startDialogue(dialogue, seeded(3)), [
      { type: "begin" },
      choose("Menu.", 2000),
      next,
      { type: "lookup", itemIds: ["a2.situations.for-here-or-to-go", "a2.other"] },
      write("I want coffee", 9000),
      next,
      choose("Large, please."),
      next,
      write("Can I pay by card?"),
      next,
      choose("Thanks! Have a nice day."),
      next,
    ]);
    if (state.status !== "finished") throw new Error("not finished");
    const summary = dialogueSessionSummary(state);
    expect(summary).toEqual({
      lessonId: dialogue.id,
      verdicts: ["almost", "wrong", "correct", "correct", "correct"],
      accuracy: 0.6,
      answerXp: xpForAnswer("almost") + 3 * xpForAnswer("correct"),
      itemOutcomes: [
        {
          itemId: "a2.situations.ill-have",
          exerciseType: "translation_choice",
          verdict: "almost",
          responseMs: 2000,
        },
        {
          itemId: "a2.situations.for-here-or-to-go",
          exerciseType: "translate_write",
          verdict: "wrong",
          responseMs: 9000,
          lookedUp: true,
        },
      ],
    });
  });
});

describe("dialogueTurnCount", () => {
  it("counts the learner turns of a path", () => {
    expect(dialogueTurnCount(dialogue)).toBe(5);
  });

  it("plays every bundled dialogue to a perfect end with its model replies", () => {
    expect(corpus.dialogues.length).toBeGreaterThanOrEqual(10);
    for (const d of corpus.dialogues) {
      let state = dialogueReducer(startDialogue(d, seeded(5)), { type: "begin" });
      while (state.status === "turn") {
        const nodeId = state.nodeId;
        const node = d.nodes.find((n) => n.id === nodeId);
        const action: DialogueAction =
          node?.kind === "choose"
            ? choose(node.options.find((o) => o.rating === "good")!.en)
            : write(node?.kind === "write" ? expandAccepted(node.accepted)[0]! : "");
        state = dialogueReducer(dialogueReducer(state, action), next);
      }
      expect({ id: d.id, status: state.status }).toEqual({ id: d.id, status: "finished" });
      expect(state.status === "finished" && state.result).toMatchObject({
        good: dialogueTurnCount(d),
        total: dialogueTurnCount(d),
      });
    }
  });
});
