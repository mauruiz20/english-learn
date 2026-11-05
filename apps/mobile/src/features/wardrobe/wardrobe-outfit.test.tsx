import { localDate, type ProgressEvent } from "@english-learn/domain";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Pressable } from "react-native";
import { AccountContext } from "@/features/account/account-context";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import { Avi } from "@/shared/ui/mascot";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { testRandomBytes } from "@/testing/random-bytes";
import { WardrobeOutfitProvider, useReloadOutfit } from "./wardrobe-outfit";

const HIDDEN = { includeHiddenElements: true } as const;

let seq = 0;
function event(type: "item_purchased" | "item_equipped", payload: object): ProgressEvent {
  seq += 1;
  return {
    id: `019a0000-0000-7000-8000-${String(seq).padStart(12, "0")}`,
    deviceId: "device-b",
    occurredAt: seq,
    localDate: localDate("2026-11-05"),
    type,
    payload: { v: 1, ...payload },
  } as ProgressEvent;
}

function ReloadButton() {
  const reload = useReloadOutfit();
  return <Pressable testID="reload" onPress={reload} />;
}

function app(repository: ReturnType<typeof createFakeRepository>, progressVersion = 0) {
  return (
    <AppServicesProvider
      services={{
        progressRepository: repository,
        clock: { today: () => localDate("2026-11-05"), nowMs: () => 0 },
        random: () => 0,
        randomBytes: testRandomBytes,
        deviceId: "d",
        settingsRepository: createFakeSettingsRepository(),
        sounds: createFakeSoundPlayer(),
      }}
    >
      <AccountContext
        value={{
          availability: "native",
          session: { status: "signed-out" },
          syncStatus: { kind: "idle" },
          progressVersion,
          actions: null,
        }}
      >
        <WardrobeOutfitProvider>
          <Avi testID="guide" size={40} />
          <Avi testID="summary" size={120} />
          <ReloadButton />
        </WardrobeOutfitProvider>
      </AccountContext>
    </AppServicesProvider>
  );
}

/** A learner with 50 plumas (10 lessons from before the event log). */
const learner = () =>
  createFakeRepository({
    xp: 1,
    completedLessonIds: Array.from({ length: 10 }, (_, i) => `l${i}`),
  });

describe("WardrobeOutfitProvider", () => {
  it("dresses every Avi in the learner's outfit", async () => {
    const repository = learner();
    await repository.appendEvents([
      event("item_purchased", { itemId: "estrella", price: 40 }),
      event("item_equipped", { slot: "sticker", itemId: "estrella" }),
      // Equipped but never bought (or unknown here): not worn.
      event("item_equipped", { slot: "head", itemId: "gorra" }),
    ]);

    await render(app(repository));

    expect(await screen.findAllByTestId("avi-item-estrella", HIDDEN)).toHaveLength(2);
    expect(screen.queryByTestId("avi-item-gorra", HIDDEN)).toBeNull();
  });

  it("follows the wardrobe's writes when asked to reload", async () => {
    const repository = learner();
    await render(app(repository));
    await act(async () => {});
    expect(screen.queryByTestId(/^avi-item-/, HIDDEN)).toBeNull();

    await repository.appendEvents([
      event("item_purchased", { itemId: "papel-cielo", price: 50 }),
      event("item_equipped", { slot: "paper", itemId: "papel-cielo" }),
    ]);
    await fireEvent.press(screen.getByTestId("reload"));

    expect(await screen.findAllByTestId("avi-item-papel-cielo", HIDDEN)).toHaveLength(2);
  });

  it("follows a sync that brought another device's outfit", async () => {
    const repository = learner();
    const view = await render(app(repository));
    await act(async () => {});

    await repository.appendEvents([
      event("item_purchased", { itemId: "rayo", price: 40 }),
      event("item_equipped", { slot: "sticker", itemId: "rayo" }),
    ]);
    await view.rerender(app(repository, 1));

    expect(await screen.findAllByTestId("avi-item-rayo", HIDDEN)).toHaveLength(2);
  });
});
