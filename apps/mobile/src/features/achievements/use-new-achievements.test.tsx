import { corpus } from "@english-learn/content/corpus";
import { localDate, type Clock, type ProgressRepository } from "@english-learn/domain";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer, type FakeSoundPlayer } from "@/testing/fake-sound-player";
import { testRandomBytes } from "@/testing/random-bytes";
import { ACHIEVEMENT_SOUND_DELAY_MS, useNewAchievements } from "./use-new-achievements";

const clock: Clock = { today: () => localDate("2030-01-01"), nowMs: () => 0 };

/** A repository whose XP the test moves, as a saved session would. */
function withXp(xp: { value: number }): ProgressRepository {
  return { ...createFakeRepository(), getXp: async () => xp.value };
}

function setup(repository: ProgressRepository, sounds: FakeSoundPlayer) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppServicesProvider
      services={{
        progressRepository: repository,
        clock,
        random: () => 0,
        randomBytes: testRandomBytes,
        deviceId: "test-device",
        settingsRepository: createFakeSettingsRepository(),
        sounds,
      }}
    >
      {children}
    </AppServicesProvider>
  );
  return renderHook(({ saved }: { saved: boolean }) => useNewAchievements(saved, corpus), {
    wrapper,
    initialProps: { saved: false },
  });
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("useNewAchievements", () => {
  it("lists the stickers the saved session earned, once, with the achievement sound", async () => {
    const xp = { value: 90 };
    const repository = withXp(xp);
    const sounds = createFakeSoundPlayer();
    const { result, rerender } = await setup(repository, sounds);
    await act(async () => {});
    expect(result.current).toEqual([]);

    xp.value = 110;
    await rerender({ saved: true });

    await waitFor(() => expect(result.current.map((a) => a.id)).toEqual(["xp-100"]));
    expect(sounds.played).toEqual([]);
    await act(async () => {
      jest.advanceTimersByTime(ACHIEVEMENT_SOUND_DELAY_MS);
    });
    expect(sounds.played).toEqual(["achievement"]);
  });

  it("lists nothing, silently, when the session earned no sticker", async () => {
    const xp = { value: 10 };
    const repository = withXp(xp);
    const sounds = createFakeSoundPlayer();
    const { result, rerender } = await setup(repository, sounds);
    await act(async () => {});

    xp.value = 20;
    await rerender({ saved: true });
    await act(async () => {
      jest.advanceTimersByTime(ACHIEVEMENT_SOUND_DELAY_MS * 2);
    });

    expect(result.current).toEqual([]);
    expect(sounds.played).toEqual([]);
  });
});
