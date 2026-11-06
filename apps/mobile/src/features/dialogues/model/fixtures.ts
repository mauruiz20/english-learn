/** A small dialogue corpus for tests (never shipped: only imported by tests). */
import {
  createCorpus,
  type Dialogue,
  type DialogueNode,
  type Item,
  type PracticeCollection,
} from "@english-learn/content";

const npc = (id: string, en: string, es: string, next: string): DialogueNode => ({
  id,
  kind: "npc",
  speaker: "server",
  en,
  es,
  next,
});

export const DIALOGUE_ID = "a2.dialogues.cafe";

/**
 * Five learner turns on every path: `ready` (choose), `order` (write, with a `wrongNext`),
 * `size` (choose), `pay` (write), `bye` (choose, two endings). A rude or confused reply leads to
 * a different reaction that joins the main line again.
 */
export const dialogue: Dialogue = {
  id: DIALOGUE_ID,
  level: "A2",
  title: "En la cafetería",
  setting: "Pides un café para llevar.",
  characters: [{ id: "server", name: "Mia", role: "mesera" }],
  start: "hello",
  nodes: [
    npc("hello", "Hi! What can I get you?", "¡Hola! ¿Qué te sirvo?", "ready"),
    {
      id: "ready",
      kind: "choose",
      itemIds: ["a2.situations.ill-have"],
      options: [
        { en: "Hi! Can I see the menu?", rating: "good", feedback: "Amable.", next: "menu" },
        { en: "Menu.", rating: "ok", feedback: "Suena seco.", next: "menu" },
        {
          en: "I'm fine, thanks.",
          rating: "wrong",
          feedback: "No te preguntó cómo estás.",
          next: "menu-confused",
        },
      ],
    },
    npc("menu", "Sure, here you go.", "Claro, aquí tienes.", "order"),
    npc(
      "menu-confused",
      "Ha, good! Here's the menu.",
      "¡Ja, qué bien! Aquí está el menú.",
      "order",
    ),
    {
      id: "order",
      kind: "write",
      itemIds: ["a2.situations.for-here-or-to-go"],
      prompt: "Pide un café para llevar.",
      accepted: ["{Can|Could} I {have|get} a coffee to go[, please]?", "A coffee to go, please."],
      tip: "«To go» es «para llevar».",
      next: "size",
      wrongNext: "size-check",
    },
    npc("size", "Small or large?", "¿Chico o grande?", "pick-size"),
    npc(
      "size-check",
      "Sorry, a coffee? Small or large?",
      "Perdón, ¿un café? ¿Chico o grande?",
      "pick-size",
    ),
    {
      id: "pick-size",
      kind: "choose",
      options: [
        {
          en: "Give me a big one.",
          rating: "wrong",
          feedback: "Suena a orden.",
          next: "total-cold",
        },
        { en: "Large, please.", rating: "good", feedback: "Claro.", next: "total" },
      ],
    },
    npc("total", "That's three dollars.", "Son tres dólares.", "pay"),
    npc("total-cold", "Okay. That's three dollars.", "Bueno. Son tres dólares.", "pay"),
    {
      id: "pay",
      kind: "write",
      prompt: "Pregunta si puedes pagar con tarjeta.",
      accepted: ["Can I pay by card?"],
      next: "thanks",
    },
    npc("thanks", "Sure. Here's your coffee!", "Claro. ¡Aquí tienes tu café!", "bye"),
    {
      id: "bye",
      kind: "choose",
      options: [
        { en: "Thanks! Have a nice day.", rating: "good", feedback: "Amable.", next: "end" },
        {
          en: "You're welcome.",
          rating: "wrong",
          feedback: "Eso dice quien recibe las gracias.",
          next: "end-odd",
        },
      ],
    },
    { id: "end", kind: "end", text: "Tienes tu café para llevar." },
    { id: "end-odd", kind: "end", text: "Tienes tu café, aunque la despedida fue rara." },
  ],
};

const item = (id: string, term: string, es: string): Item => ({
  id,
  level: "A2",
  topics: ["situations"],
  kind: "phrase",
  term,
  es,
});

export const collection: PracticeCollection = {
  id: "practice.dialogues",
  title: "Diálogos",
  summary: "Conversaciones que cambian según lo que respondas.",
  groups: [
    {
      id: "practice.dialogues.everyday",
      level: "A2",
      title: "Fuera de casa",
      summary: "En la calle y en la cafetería.",
      dialogueIds: [DIALOGUE_ID],
    },
  ],
};

/** The dialogue above with its items and collection. */
export const dialogueContent = createCorpus([
  {
    items: [
      item("a2.situations.ill-have", "I'll have (the soup)", "para mí (la sopa)"),
      item("a2.situations.for-here-or-to-go", "for here or to go", "para comer aquí o para llevar"),
    ],
    dialogues: [dialogue],
    practice: [collection],
  },
]);
