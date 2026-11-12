import { corpus } from "@english-learn/content/corpus";
import {
  dialogueReducer,
  dialogueSessionSummary,
  dialogueTurnCount,
  startDialogue,
  currentTurn,
} from "./dialogue-runner";

const ID = "b1.dialogues.change-plans-with-friend";
const pilot = () => {
  const dialogue = corpus.dialoguesById.get(ID);
  if (!dialogue) throw new Error("Missing B1 friend-plans pilot");
  return dialogue;
};

it("offers one optional B1 scenario with six connected turns, audio-ready NPC lines and brief feedback", () => {
  const dialogue = pilot();
  expect(dialogue.level).toBe("B1");
  expect(dialogueTurnCount(dialogue)).toBe(6);
  expect(dialogue.nodes.filter((node) => node.kind === "write")).toHaveLength(2);
  expect(
    dialogue.nodes.filter((node) => node.kind === "npc").every((node) => node.en && node.es),
  ).toBe(true);
  expect(corpus.lessonsById.has(ID)).toBe(false);
  expect(
    corpus.practice.some((collection) =>
      collection.groups.some((group) => "dialogueIds" in group && group.dialogueIds.includes(ID)),
    ),
  ).toBe(true);
});

it.each(["In the afternoon would be better for me.", "Could we meet in the morning?"])(
  "reacts to the chosen time (%s) and finishes with a saved lesson summary",
  (time) => {
    const dialogue = pilot();
    let state = dialogueReducer(
      startDialogue(dialogue, () => 0),
      { type: "begin" },
    );
    const replies = [
      "I'm looking forward to it, but something has come up.",
      "Could we put it off until Sunday?",
      time,
      "Five sounds good. Where shall we meet?",
      "Let's meet outside the cafe at five on Sunday.",
      "Me too! See you on Sunday.",
    ];
    for (const text of replies) {
      const turn = currentTurn(state);
      if (!turn) throw new Error("Missing learner turn");
      state = dialogueReducer(
        state,
        turn.kind === "write"
          ? { type: "write", text, responseMs: 1000 }
          : { type: "choose", en: text, responseMs: 1000 },
      );
      expect(state.status).toBe("feedback");
      state = dialogueReducer(state, { type: "continue" });
    }
    expect(state.status).toBe("finished");
    if (state.status !== "finished") throw new Error("Pilot did not finish");
    expect(dialogueSessionSummary(state)).toMatchObject({ lessonId: ID, accuracy: 1 });
    expect(dialogueSessionSummary(state).verdicts).toHaveLength(6);
  },
);

it("keeps the conversation moving after wrong replies and explains the misunderstanding", () => {
  const dialogue = pilot();
  let state = dialogueReducer(
    startDialogue(dialogue, () => 0),
    { type: "begin" },
  );
  for (let index = 0; index < 6; index += 1) {
    const turn = currentTurn(state);
    if (!turn) throw new Error("Missing learner turn");
    if (turn.kind === "write")
      state = dialogueReducer(state, { type: "write", text: "I have no idea.", responseMs: 1000 });
    else
      state = dialogueReducer(state, {
        type: "choose",
        en: turn.options.find((option) => option.rating === "wrong")!.en,
        responseMs: 1000,
      });
    expect(state).toMatchObject({ status: "feedback", feedback: { rating: "wrong" } });
    state = dialogueReducer(state, { type: "continue" });
  }
  expect(state.status).toBe("finished");
  if (state.status !== "finished") throw new Error("Pilot did not finish");
  expect(dialogueSessionSummary(state).accuracy).toBe(0);
});
