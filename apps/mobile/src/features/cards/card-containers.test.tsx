import { corpus } from "@english-learn/content/corpus";
import { initialState, localDate } from "@english-learn/domain";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import type { ReactNode } from "react";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import {
  createFakeRepository,
  type FakeProgressRepository,
} from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { testRandomBytes } from "@/testing/random-bytes";
import { CardContainer } from "./card-container";
import { CardsContainer } from "./cards-container";

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => true),
};
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof React>("react");
  return {
    useRouter: () => mockRouter,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

const TODAY = localDate("2030-01-01");
const card = corpus.cardsById.get("b1.grammar.look-forward-to")!;
const studied = () =>
  createFakeRepository({ states: card.itemIds.map((id) => initialState(id, TODAY)) });

/** The card studied and practiced once with `accuracy`, saved like a lesson with its id. */
async function practiced(accuracy: number) {
  const repository = studied();
  await repository.appendEvents([
    {
      id: "0190000a-0000-7000-8000-000000000001",
      deviceId: "test-device",
      occurredAt: 1,
      localDate: TODAY,
      type: "session_completed",
      payload: { v: 1, sessionId: "s1", kind: "lesson", lessonId: card.id, answerXp: 60, accuracy },
    },
  ]);
  return repository;
}
const exercises = card.exerciseIds.length;

function withServices(repository: FakeProgressRepository, children: ReactNode) {
  return (
    <AppServicesProvider
      services={{
        progressRepository: repository,
        clock: { today: () => TODAY, nowMs: () => 0 },
        random: () => 0,
        randomBytes: testRandomBytes,
        deviceId: "test-device",
        settingsRepository: createFakeSettingsRepository({ lookupHintDismissed: true }),
        sounds: createFakeSoundPlayer(),
      }}
    >
      {children}
    </AppServicesProvider>
  );
}

beforeEach(() => jest.clearAllMocks());

describe("CardsContainer", () => {
  it("lists every card with what the learner studied, and opens one", async () => {
    await render(withServices(studied(), <CardsContainer />));

    expect(
      await screen.findByText(`${corpus.cards.length} fichas · 1 estudiada`),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Look forward to + -ing, B1, estudiada" }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/fichas/b1.grammar.look-forward-to");
  });
});

describe("CardsContainer results", () => {
  it("shows each practiced card's best result from the log", async () => {
    await render(withServices(await practiced(1), <CardsContainer />));

    expect(
      await screen.findByRole("button", {
        name: `Look forward to + -ing, B1, estudiada, completada sin errores: ${exercises} de ${exercises} correctas`,
      }),
    ).toBeOnTheScreen();
    expect(screen.getByText(`Perfecta · ${exercises}/${exercises}`)).toBeOnTheScreen();
  });
});

describe("CardContainer", () => {
  it("shows the card with its status and opens its practice", async () => {
    await render(withServices(studied(), <CardContainer cardId={card.id} />));

    expect(await screen.findByText("Estudiada")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Practicar" }));
    expect(mockRouter.push).toHaveBeenCalledWith("/fichas/b1.grammar.look-forward-to/practicar");
  });

  it("goes back to the session it was opened from", async () => {
    await render(
      withServices(createFakeRepository(), <CardContainer cardId={card.id} fromSession />),
    );

    await fireEvent.press(await screen.findByRole("button", { name: "Volver al ejercicio" }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("explains an unknown card", async () => {
    await render(withServices(createFakeRepository(), <CardContainer cardId="b1.grammar.nope" />));

    expect(screen.getByRole("alert")).toHaveTextContent("No encontramos esta ficha.");
  });
});
