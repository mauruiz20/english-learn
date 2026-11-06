import { fireEvent, render, screen, within } from "@testing-library/react-native";
import type { TranscriptLine } from "./model/dialogue-runner";
import { DialogueView, type DialogueViewProps, type DialogueViewState } from "./dialogue-view";

const MIA = { id: "server", name: "Mia", role: "mesera" };
const HELLO: TranscriptLine = {
  kind: "npc",
  nodeId: "hello",
  speaker: MIA,
  en: "Hi! What can I get you?",
  es: "¡Hola! ¿Qué te sirvo?",
};

const handlers = {
  onBegin: jest.fn(),
  onAutoSpeakChange: jest.fn(),
  onChoose: jest.fn(),
  onWrite: jest.fn(),
  onContinue: jest.fn(),
  onRetrySave: jest.fn(),
  onDone: jest.fn(),
  onRedo: jest.fn(),
  onOpenCard: jest.fn(),
};

const view = (state: DialogueViewState, props: Partial<DialogueViewProps> = {}) =>
  render(<DialogueView state={state} {...handlers} {...props} />);

const chat = (
  o: Partial<Extract<DialogueViewState, { status: "chat" }>> = {},
): DialogueViewState => ({
  status: "chat",
  title: "En la cafetería",
  position: 1,
  total: 5,
  transcript: [HELLO],
  turn: { kind: "choose", options: ["Menu.", "Hi! Can I see the menu?"] },
  feedback: null,
  ...o,
});

beforeEach(() => jest.clearAllMocks());

describe("DialogueView", () => {
  it("says when the dialogue does not exist", async () => {
    await view({ status: "not-found" });
    expect(screen.getByText("No encontramos este diálogo.")).toBeOnTheScreen();
  });

  it("introduces the scene and the characters, and starts on a tap", async () => {
    await view({
      status: "intro",
      title: "En la cafetería",
      level: "A2",
      setting: "Pides un café para llevar.",
      characters: [MIA],
      autoSpeak: false,
    });
    expect(screen.getByRole("header", { name: "En la cafetería" })).toBeOnTheScreen();
    expect(screen.getByText("Pides un café para llevar.")).toBeOnTheScreen();
    expect(screen.getByText("Mia, mesera")).toBeOnTheScreen();
    const toggle = screen.getByRole("switch", { name: "Leer en voz alta lo que dicen" });
    await fireEvent.press(toggle);
    expect(handlers.onAutoSpeakChange).toHaveBeenCalledWith(true);
    await fireEvent.press(screen.getByRole("button", { name: "Empezar" }));
    expect(handlers.onBegin).toHaveBeenCalled();
  });

  it("hides the read-aloud switch without pronunciation", async () => {
    await view({
      status: "intro",
      title: "En la cafetería",
      level: "A2",
      setting: "Pides un café.",
      characters: [MIA],
    });
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("shows the character's lines with their Spanish on demand, and the replies to choose", async () => {
    await view(chat());
    expect(screen.getByText("Respuesta 1 de 5")).toBeOnTheScreen();
    const bubble = screen.getByTestId("npc-line-hello");
    expect(within(bubble).getByText("Mia")).toBeOnTheScreen();
    expect(within(bubble).getByText("Hi! What can I get you?")).toBeOnTheScreen();
    expect(screen.queryByText("¡Hola! ¿Qué te sirvo?")).toBeNull();
    await fireEvent.press(within(bubble).getByRole("button", { name: "Ver en español" }));
    expect(screen.getByText("¡Hola! ¿Qué te sirvo?")).toBeOnTheScreen();
    await fireEvent.press(within(bubble).getByRole("button", { name: "Ocultar el español" }));
    expect(screen.queryByText("¡Hola! ¿Qué te sirvo?")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Responder: Menu." }));
    expect(handlers.onChoose).toHaveBeenCalledWith("Menu.");
  });

  it("takes a written reply", async () => {
    await view(chat({ turn: { kind: "write", prompt: "Pide un café para llevar." } }));
    expect(screen.getByText("Pide un café para llevar.")).toBeOnTheScreen();
    const send = screen.getByRole("button", { name: "Responder" });
    expect(send.props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText("Tu respuesta en inglés"), "A coffee to go");
    await fireEvent.press(screen.getByRole("button", { name: "Responder" }));
    expect(handlers.onWrite).toHaveBeenCalledWith("A coffee to go");
  });

  it("shows the feedback on a reply with a better one, and goes on", async () => {
    await view(
      chat({
        transcript: [HELLO, { kind: "learner", nodeId: "ready", text: "Menu.", rating: "ok" }],
        turn: null,
        feedback: { rating: "ok", text: "Suena seco.", better: "Hi! Can I see the menu?" },
      }),
    );
    expect(screen.getByTestId("learner-line-ready")).toHaveTextContent(/Menu\.$/);
    expect(
      screen.getByRole("alert", {
        name: "Se puede mejorar. Suena seco. Mejor: Hi! Can I see the menu?",
      }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Continuar" }));
    expect(handlers.onContinue).toHaveBeenCalled();
  });

  it("shows a written reply's tip after a wrong one", async () => {
    await view(
      chat({
        turn: null,
        feedback: {
          rating: "wrong",
          text: "No es lo que se esperaba aquí.",
          better: "Can I have a coffee to go?",
          tip: "«To go» es «para llevar».",
        },
      }),
    );
    expect(
      screen.getByRole("alert", {
        name: "No del todo. No es lo que se esperaba aquí. Mejor: Can I have a coffee to go? «To go» es «para llevar».",
      }),
    ).toBeOnTheScreen();
  });

  it("can retry a failed save", async () => {
    await view({ status: "save-error" });
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(handlers.onRetrySave).toHaveBeenCalled();
  });

  it("ends with how it went, the good replies, the best result and what was new", async () => {
    await view({
      status: "summary",
      title: "En la cafetería",
      ending: "Tienes tu café para llevar.",
      good: 5,
      total: 5,
      xpEarned: 70,
      streakDays: 1,
      best: { correct: 5, total: 5, perfect: true },
      toReview: [],
      recap: [
        {
          id: "a2.situations.for-here-or-to-go",
          term: "for here or to go",
          es: "para comer aquí o para llevar",
          example: { en: "Can I have a coffee to go?" },
        },
      ],
      doneLabel: "Volver a Diálogos",
    });
    expect(screen.getByRole("header", { name: "¡Diálogo completado!" })).toBeOnTheScreen();
    expect(screen.getByText("Tienes tu café para llevar.")).toBeOnTheScreen();
    expect(screen.getByText("Respuestas buenas: 5 de 5")).toBeOnTheScreen();
    expect(screen.getByText("Perfecto · 5/5")).toBeOnTheScreen();
    expect(
      screen.getByLabelText("Tu mejor resultado: completado sin errores: 5 de 5 respuestas buenas"),
    ).toBeOnTheScreen();
    expect(screen.getByText("Lo nuevo de hoy")).toBeOnTheScreen();
    expect(screen.getByText("for here or to go")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Repetir diálogo" }));
    expect(handlers.onRedo).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Volver a Diálogos" }));
    expect(handlers.onDone).toHaveBeenCalled();
  });
});
