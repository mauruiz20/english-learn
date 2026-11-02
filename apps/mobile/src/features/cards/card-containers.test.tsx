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
