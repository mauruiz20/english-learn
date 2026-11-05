import { localDate, type ProgressEvent } from "@english-learn/domain";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import type React from "react";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { createTestRandomBytes } from "@/testing/random-bytes";
import { WardrobeContainer } from "./wardrobe-container";

const mockParams: { item?: string } = {};
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof React>("react");
  return {
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

const HIDDEN = { includeHiddenElements: true } as const;

/** A learner with `plumas` plumas (lessons from before the event log pay 5 each). */
function learner(plumas: number) {
  return createFakeRepository({
    xp: 1,
    completedLessonIds: Array.from({ length: plumas / 5 }, (_, i) => `l${i}`),
  });
}

/** A purchase another device made offline, arriving by sync. */
function remotePurchase(itemId: string, price: number): ProgressEvent {
  return {
    id: "019a0000-0000-7000-8000-00000000abcd",
    deviceId: "device-b",
    occurredAt: 1,
    localDate: localDate("2026-11-04"),
    type: "item_purchased",
    payload: { v: 1, itemId, price },
  };
}

async function renderWardrobe(repository = learner(50)) {
  const sounds = createFakeSoundPlayer();
  await render(
    <AppServicesProvider
      services={{
        progressRepository: repository,
        clock: { today: () => localDate("2026-11-05"), nowMs: () => Date.UTC(2026, 10, 5) },
        random: () => 0,
        randomBytes: createTestRandomBytes(),
        deviceId: "device-a",
        settingsRepository: createFakeSettingsRepository(),
        sounds,
      }}
    >
      <WardrobeContainer />
    </AppServicesProvider>,
  );
  await screen.findByLabelText(/^(Tienes|Debes) /);
  return { repository, sounds };
}

const preview = () => screen.getByTestId("armario-avi", HIDDEN);
const wearing = (id: string) => within(preview()).queryByTestId(`avi-item-${id}`, HIDDEN);

describe("the wardrobe", () => {
  beforeEach(() => {
    delete mockParams.item;
  });

  it("shows Avi, the balance and a tab per slot, with every item's price", async () => {
    await renderWardrobe();

    expect(screen.getByRole("header", { name: "El armario de Avi" })).toBeOnTheScreen();
    expect(screen.getByLabelText("Tienes 50 plumas")).toBeOnTheScreen();
    expect(preview()).toBeOnTheScreen();
    expect(screen.getAllByRole("tab").map((tab) => tab.props.accessibilityLabel)).toEqual([
      "Gorros",
      "Cuello",
      "Gafas",
      "Papel",
      "Stickers",
    ]);
    expect(screen.getByRole("tab", { name: "Gorros" })).toBeSelected();
    expect(screen.getByRole("button", { name: "Gorra, 80 plumas" })).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Birrete, se gana con la insignia Nivel A2 completo" }),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("tab", { name: "Stickers" }));
    expect(screen.getByRole("tab", { name: "Stickers" })).toBeSelected();
    expect(screen.getByRole("button", { name: "Estrella, 40 plumas" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Gorra, 80 plumas" })).toBeNull();
  });

  it("tries an item on for free, then buys it after asking, and puts it on", async () => {
    const { repository, sounds } = await renderWardrobe();
    await fireEvent.press(screen.getByRole("tab", { name: "Stickers" }));

    await fireEvent.press(screen.getByRole("button", { name: "Estrella, 40 plumas" }));
    expect(wearing("estrella")).not.toBeNull();
    expect(sounds.played).toContain("tap");
    expect(repository.events()).toHaveLength(1);

    await fireEvent.press(screen.getByRole("button", { name: "Comprar por 40 plumas" }));
    expect(screen.getByText("¿Comprar la estrella por 40 plumas?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Comprar" }));

    expect(await screen.findByText("¡Listo! Avi ya tiene su estrella.")).toBeOnTheScreen();
    expect(sounds.played.at(-1)).toBe("achievement");
    expect(screen.getByLabelText("Tienes 10 plumas")).toBeOnTheScreen();
    expect(repository.events().at(-1)).toMatchObject({
      type: "item_purchased",
      payload: { itemId: "estrella", price: 40 },
    });
    expect(screen.getByRole("button", { name: "Estrella, 40 plumas, comprado" })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Ponérselo" }));
    expect(
      await screen.findByRole("button", { name: "Estrella, 40 plumas, comprado, puesto" }),
    ).toBeOnTheScreen();
    expect(repository.events().at(-1)).toMatchObject({
      type: "item_equipped",
      payload: { slot: "sticker", itemId: "estrella" },
    });
    expect((await repository.getRewards()).equipped).toEqual({ sticker: "estrella" });

    await fireEvent.press(screen.getByRole("button", { name: "Quitárselo" }));
    expect(
      await screen.findByRole("button", { name: "Estrella, 40 plumas, comprado" }),
    ).toBeOnTheScreen();
    expect((await repository.getRewards()).equipped).toEqual({ sticker: null });
    expect(wearing("estrella")).toBeNull();
  });

  it("writes nothing when the learner says 'Ahora no'", async () => {
    const { repository } = await renderWardrobe();
    await fireEvent.press(screen.getByRole("tab", { name: "Stickers" }));
    await fireEvent.press(screen.getByRole("button", { name: "Corazón, 40 plumas" }));
    await fireEvent.press(screen.getByRole("button", { name: "Comprar por 40 plumas" }));

    await fireEvent.press(screen.getByRole("button", { name: "Ahora no" }));

    await waitFor(() => expect(screen.queryByText(/¿Comprar el corazón/)).toBeNull());
    expect(repository.events()).toHaveLength(1);
    expect(screen.getByLabelText("Tienes 50 plumas")).toBeOnTheScreen();
  });

  it("does not sell what the balance does not cover, and says how much is missing", async () => {
    await renderWardrobe();
    await fireEvent.press(screen.getByRole("tab", { name: "Cuello" }));

    await fireEvent.press(screen.getByRole("button", { name: "Pañuelo, 60 plumas" }));

    expect(wearing("panuelo")).not.toBeNull();
    expect(screen.getByText("Te faltan 10 plumas")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Comprar por 60 plumas" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Comprar por 60 plumas. Te faltan 10 plumas" }),
    ).toBeDisabled();
  });

  it("shows a debt plainly, sells nothing, and still dresses Avi in what is owned", async () => {
    const repository = learner(50);
    await repository.appendEvents([remotePurchase("papel-cielo", 50), remotePurchase2()]);
    const { repository: repo } = await renderWardrobe(repository);

    expect(screen.getByLabelText("Debes 40 plumas")).toBeOnTheScreen();
    expect(screen.getByText("Debes 40 plumas")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("tab", { name: "Stickers" }));
    await fireEvent.press(screen.getByRole("button", { name: "Corazón, 40 plumas" }));
    expect(screen.getByText("Te faltan 80 plumas")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("tab", { name: "Papel" }));
    await fireEvent.press(screen.getByRole("button", { name: "Papel cielo, 50 plumas, comprado" }));
    await fireEvent.press(screen.getByRole("button", { name: "Ponérselo" }));

    expect(
      await screen.findByRole("button", { name: "Papel cielo, 50 plumas, comprado, puesto" }),
    ).toBeOnTheScreen();
    expect((await repo.getRewards()).equipped).toEqual({ paper: "papel-cielo" });
  });

  it("opens on the item a link asks for (?item=)", async () => {
    mockParams.item = "gafas-de-sol";
    await renderWardrobe();

    expect(screen.getByRole("tab", { name: "Gafas" })).toBeSelected();
    expect(wearing("gafas-de-sol")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Comprar por 120 plumas. Te faltan 70 plumas" }),
    ).toBeDisabled();
  });

  it("tells about a badge prize instead of selling it", async () => {
    await renderWardrobe();
    await fireEvent.press(
      screen.getByRole("button", { name: "Birrete, se gana con la insignia Nivel A2 completo" }),
    );

    expect(screen.getByText("Se gana con la insignia Nivel A2 completo")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /^Comprar/ })).toBeNull();
  });
});

/** Two offline purchases on another device: 50 + 40 out of 50 plumas. */
function remotePurchase2(): ProgressEvent {
  return { ...remotePurchase("rayo", 40), id: "019a0000-0000-7000-8000-00000000abce" };
}
