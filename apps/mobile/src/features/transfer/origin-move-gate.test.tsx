import { ApiError } from "@english-learn/api-client";
import type { StoredEvent } from "@english-learn/domain";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { testRandomBytes } from "@/testing/random-bytes";
import { OriginMoveGate, useOriginMoveOffer } from "./origin-move-gate";

const move = {
  oldOrigin: "https://english-learn-iwl.pages.dev",
  newOrigin: "https://english.maumar.com.ar",
};
const EVENT: StoredEvent = {
  id: "019a3456-7890-7abc-8def-0123456789ab",
  deviceId: "old",
  occurredAt: 1,
  localDate: "2026-10-30",
  type: "item_reviewed",
  payload: { v: 1 },
};

function Offer() {
  const offer = useOriginMoveOffer();
  if (offer === null) return <Text>app as usual</Text>;
  return (
    <>
      <Text>{`offer: ${offer.status.kind}`}</Text>
      <Pressable accessibilityRole="button" onPress={offer.take}>
        <Text>take</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={offer.skip}>
        <Text>skip</Text>
      </Pressable>
    </>
  );
}

function setup({
  href,
  events = [],
  migratedTo = null,
  createTransfer = async () => ({ token: "tok", expiresAt: "2026-10-30T12:15:00Z" }),
}: {
  href: string;
  events?: StoredEvent[];
  migratedTo?: string | null;
  createTransfer?: () => Promise<{ token: string; expiresAt: string }>;
}) {
  const settings = createFakeSettingsRepository({ migratedTo });
  const getAllEvents = jest.fn(async () => events);
  const replace = jest.fn();
  const assign = jest.fn();
  const { origin, pathname, search, hash } = new URL(href);
  const view = render(
    <AppServicesProvider
      services={{
        progressRepository: createFakeRepository(),
        clock: { today: () => "2026-10-30" as never, nowMs: () => 0 },
        random: () => 0,
        randomBytes: testRandomBytes,
        deviceId: "device",
        settingsRepository: settings,
        sounds: createFakeSoundPlayer(),
        transfer: { getAllEvents, importEvents: async () => 0 },
      }}
    >
      <OriginMoveGate
        move={move}
        location={{ origin, pathname, search, hash }}
        replace={replace}
        assign={assign}
        api={{ createTransfer }}
      >
        <Offer />
      </OriginMoveGate>
    </AppServicesProvider>,
  );
  return { view, settings, getAllEvents, replace, assign };
}

describe("OriginMoveGate", () => {
  it("shows the app right away on any other address, without reading the log", async () => {
    const { view, getAllEvents } = setup({ href: "https://english.maumar.com.ar/" });
    await view;

    expect(screen.getByText("app as usual")).toBeOnTheScreen();
    expect(getAllEvents).not.toHaveBeenCalled();
  });

  it("sends a learner without progress to the new address before showing anything", async () => {
    const { view, replace } = setup({ href: "https://english-learn-iwl.pages.dev/review" });
    await view;

    await act(async () => {});
    expect(replace).toHaveBeenCalledWith("https://english.maumar.com.ar/review");
    expect(screen.queryByText(/offer|app as usual/)).toBeNull();
  });

  it("sends a learner whose progress already moved", async () => {
    const { view, replace } = setup({
      href: "https://english-learn-iwl.pages.dev/",
      events: [EVENT],
      migratedTo: move.newOrigin,
    });
    await view;

    await act(async () => {});
    expect(replace).toHaveBeenCalledWith("https://english.maumar.com.ar/");
  });

  it("offers to take the progress and, once sent, opens the import page", async () => {
    const { view, settings, assign, replace } = setup({
      href: "https://english-learn-iwl.pages.dev/",
      events: [EVENT],
    });
    await view;

    expect(await screen.findByText("offer: idle")).toBeOnTheScreen();
    await fireEvent.press(screen.getByText("take"));

    expect(assign).toHaveBeenCalledWith("https://english.maumar.com.ar/importar#t=tok");
    expect(settings.migratedTo()).toBe(move.newOrigin);
    expect(screen.getByText("offer: sending")).toBeOnTheScreen();
    expect(replace).not.toHaveBeenCalled();
  });

  it("reports a failed transfer so the learner can retry", async () => {
    const { view, assign } = setup({
      href: "https://english-learn-iwl.pages.dev/",
      events: [EVENT],
      createTransfer: async () => {
        throw new ApiError(413, "payload_too_large", "big");
      },
    });
    await view;

    await fireEvent.press(await screen.findByText("take"));

    expect(await screen.findByText("offer: failed")).toBeOnTheScreen();
    expect(assign).not.toHaveBeenCalled();
  });

  it("goes to the new address without the progress when asked", async () => {
    const { view, assign, settings } = setup({
      href: "https://english-learn-iwl.pages.dev/",
      events: [EVENT],
    });
    await view;

    await fireEvent.press(await screen.findByText("skip"));

    expect(assign).toHaveBeenCalledWith("https://english.maumar.com.ar/");
    expect(settings.migratedTo()).toBeNull();
  });
});
