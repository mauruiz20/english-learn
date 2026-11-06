import { localDate } from "@english-learn/domain";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import { PronunciationProvider } from "@/features/pronunciation/pronunciation";
import {
  createFakeRepository,
  type FakeProgressRepository,
} from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer, type FakeSoundPlayer } from "@/testing/fake-sound-player";
import { createFakeSpeech, type FakeSpeech } from "@/testing/fake-speech";
import { createPreventRemoveMock } from "@/testing/prevent-remove";
import { testRandomBytes } from "@/testing/random-bytes";
import { DialogueContainer } from "./dialogue-container";
import { DIALOGUE_ID, dialogueContent } from "./model/fixtures";

const mockRouter = {
  canGoBack: jest.fn(() => true),
  back: jest.fn(),
  replace: jest.fn(),
  push: jest.fn(),
};
const mockPreventRemove = createPreventRemoveMock();
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  usePreventRemove: (...args: Parameters<typeof mockPreventRemove.hook>) =>
    mockPreventRemove.hook(...args),
  Stack: { Screen: () => null },
}));

const TODAY = localDate("2030-01-01");
let sounds: FakeSoundPlayer;

function renderDialogue(
  repository: FakeProgressRepository,
  { speech, id = DIALOGUE_ID }: { speech?: FakeSpeech; id?: string } = {},
) {
  const services = {
    progressRepository: repository,
    clock: { today: () => TODAY, nowMs: () => 0 },
    random: () => 0.5,
    randomBytes: testRandomBytes,
    deviceId: "test-device",
    settingsRepository: createFakeSettingsRepository(),
    sounds,
    ...(speech === undefined ? {} : { speech }),
  };
  return render(
    <AppServicesProvider services={services}>
      <PronunciationProvider>
        <DialogueContainer dialogueId={id} content={dialogueContent} />
      </PronunciationProvider>
    </AppServicesProvider>,
  );
}

const press = async (name: string) => fireEvent.press(screen.getByRole("button", { name }));

/** Replies with good choices and correct writing, continuing after each feedback. */
async function playAllGood() {
  await press("Responder: Hi! Can I see the menu?");
  await press("Continuar");
  await fireEvent.changeText(
    screen.getByLabelText("Tu respuesta en inglés"),
    "A coffee to go, please.",
  );
  await press("Responder");
  await press("Continuar");
  await press("Responder: Large, please.");
  await press("Continuar");
  await fireEvent.changeText(screen.getByLabelText("Tu respuesta en inglés"), "Can I pay by card?");
  await press("Responder");
  await press("Continuar");
  await press("Responder: Thanks! Have a nice day.");
  await press("Continuar");
}

beforeEach(() => {
  jest.clearAllMocks();
  sounds = createFakeSoundPlayer();
});

describe("DialogueContainer", () => {
  it("says when the dialogue does not exist", async () => {
    await renderDialogue(createFakeRepository(), { id: "a2.dialogues.nope" });
    expect(screen.getByText("No encontramos este diálogo.")).toBeOnTheScreen();
  });

  it("plays a dialogue to a perfect end and saves it as a lesson with its id", async () => {
    const repository = createFakeRepository();
    await renderDialogue(repository);
    await press("Empezar");
    expect(screen.getByText("Hi! What can I get you?")).toBeOnTheScreen();
    await playAllGood();

    expect(await screen.findByRole("header", { name: "¡Diálogo completado!" })).toBeOnTheScreen();
    expect(screen.getByText("Tienes tu café para llevar.")).toBeOnTheScreen();
    expect(screen.getByText("Respuestas buenas: 5 de 5")).toBeOnTheScreen();
    expect(await screen.findByText("Perfecto · 5/5")).toBeOnTheScreen();
    expect(screen.getByText("Lo nuevo de hoy")).toBeOnTheScreen();

    const sessions = repository.events().filter((e) => e.type === "session_completed");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.payload).toMatchObject({
      kind: "lesson",
      lessonId: DIALOGUE_ID,
      accuracy: 1,
      answerXp: 50,
    });
    const reviewed = repository
      .events()
      .filter((e) => e.type === "item_reviewed")
      .map((e) => (e.payload as { itemId: string }).itemId);
    expect(reviewed).toEqual(["a2.situations.ill-have", "a2.situations.for-here-or-to-go"]);
    expect(sounds.played).toContain("correct");
    expect(sounds.played).toContain("complete");

    await press("Volver a Diálogos");
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("shows a wrong reply's feedback and the other reaction, and asks before leaving", async () => {
    await renderDialogue(createFakeRepository());
    await press("Empezar");
    expect(mockPreventRemove.active).toBe(false);
    await press("Responder: I'm fine, thanks.");
    expect(
      screen.getByRole("alert", {
        name: "No del todo. No te preguntó cómo estás. Mejor: Hi! Can I see the menu?",
      }),
    ).toBeOnTheScreen();
    expect(sounds.played).toContain("wrong");
    expect(mockPreventRemove.active).toBe(true);
    await press("Continuar");
    expect(screen.getByText("Ha, good! Here's the menu.")).toBeOnTheScreen();
  });

  it("speaks a character's line from its speaker, and nothing on its own", async () => {
    const speech = createFakeSpeech();
    await renderDialogue(createFakeRepository(), { speech });
    await screen.findByRole("switch", { name: "Leer en voz alta lo que dicen" });
    await press("Empezar");
    expect(speech.spoken).toEqual([]);
    await press("Escuchar: Hi! What can I get you?");
    expect(speech.spoken.map((s) => s.text)).toEqual(["Hi! What can I get you?"]);
  });

  it("reads the new lines aloud on the learner's taps once asked to", async () => {
    const speech = createFakeSpeech();
    await renderDialogue(createFakeRepository(), { speech });
    await fireEvent.press(
      await screen.findByRole("switch", { name: "Leer en voz alta lo que dicen" }),
    );
    await press("Empezar");
    expect(speech.spoken.at(-1)?.text).toBe("Hi! What can I get you?");
    await press("Responder: Menu.");
    expect(speech.spoken).toHaveLength(1);
    await press("Continuar");
    expect(speech.spoken.at(-1)?.text).toBe("Sure, here you go.");
  });

  it("starts again from the intro on Repetir diálogo", async () => {
    await renderDialogue(createFakeRepository());
    await press("Empezar");
    await playAllGood();
    await fireEvent.press(await screen.findByRole("button", { name: "Repetir diálogo" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Empezar" })).toBeOnTheScreen());
  });
});
