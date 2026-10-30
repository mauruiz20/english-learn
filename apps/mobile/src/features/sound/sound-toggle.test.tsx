import { localDate } from "@english-learn/domain";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { SoundPreferenceProvider } from "./sound-preference";
import { SoundToggle } from "./sound-toggle";
import { testRandomBytes } from "@/testing/random-bytes";

function renderToggle(settings = createFakeSettingsRepository(), sounds = createFakeSoundPlayer()) {
  const services = {
    progressRepository: createFakeRepository(),
    clock: { today: () => localDate("2026-10-29"), nowMs: () => 0 },
    random: () => 0,
    randomBytes: testRandomBytes,
    deviceId: "test-device",
    settingsRepository: settings,
    sounds,
  };
  return render(
    <AppServicesProvider services={services}>
      <SoundPreferenceProvider>
        <SoundToggle />
      </SoundPreferenceProvider>
    </AppServicesProvider>,
  );
}

describe("SoundToggle", () => {
  it("offers to mute when sounds are on (the default)", async () => {
    await renderToggle();

    expect(await screen.findByRole("button", { name: "Silenciar sonidos" })).toBeOnTheScreen();
  });

  it("mutes the player and remembers it", async () => {
    const settings = createFakeSettingsRepository();
    const sounds = createFakeSoundPlayer();
    await renderToggle(settings, sounds);

    await fireEvent.press(await screen.findByRole("button", { name: "Silenciar sonidos" }));

    expect(screen.getByRole("button", { name: "Activar sonidos" })).toBeOnTheScreen();
    expect(sounds.enabled()).toBe(false);
    expect(settings.soundEnabled()).toBe(false);
  });

  it("starts muted when the learner muted sounds before, and turns them back on", async () => {
    const settings = createFakeSettingsRepository({ soundEnabled: false });
    const sounds = createFakeSoundPlayer();
    await renderToggle(settings, sounds);

    await fireEvent.press(await screen.findByRole("button", { name: "Activar sonidos" }));

    expect(screen.getByRole("button", { name: "Silenciar sonidos" })).toBeOnTheScreen();
    expect(sounds.enabled()).toBe(true);
    expect(settings.soundEnabled()).toBe(true);
  });

  it("applies the stored preference to the player as soon as it is read", async () => {
    const sounds = createFakeSoundPlayer();
    await renderToggle(createFakeSettingsRepository({ soundEnabled: false }), sounds);

    await screen.findByRole("button", { name: "Activar sonidos" });
    expect(sounds.enabled()).toBe(false);
  });
});
