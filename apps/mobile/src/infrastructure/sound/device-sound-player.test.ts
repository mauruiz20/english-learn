import { createDeviceSoundPlayer, type AudioClip, type HapticsPort } from "./device-sound-player";
import { SOUND_NAMES, type SoundName } from "./sound-player";

function fakeClip(): AudioClip & { plays: number; seeks: number[] } {
  return {
    volume: 1,
    plays: 0,
    seeks: [],
    play() {
      this.plays += 1;
    },
    async seekTo(seconds: number) {
      this.seeks.push(seconds);
    },
  };
}

function fakeHaptics(): HapticsPort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    impactLight: async () => void calls.push("impact:light"),
    notify: async (type) => void calls.push(`notify:${type}`),
    android: async (type) => void calls.push(`android:${type}`),
  };
}

function setup(os: "web" | "ios" | "android" = "web") {
  const clips = new Map<SoundName, ReturnType<typeof fakeClip>>();
  const haptics = fakeHaptics();
  const log = jest.fn();
  const player = createDeviceSoundPlayer({
    os,
    createClip: (name) => {
      const clip = fakeClip();
      clips.set(name, clip);
      return clip;
    },
    haptics,
    log,
  });
  const clip = (name: SoundName) => clips.get(name)!;
  return { player, clip, clips, haptics, log };
}

describe("createDeviceSoundPlayer", () => {
  it("preloads one clip per sound", () => {
    const { clips } = setup();

    expect([...clips.keys()].sort()).toEqual([...SOUND_NAMES].sort());
  });

  it("plays a sound from the start", () => {
    const { player, clip } = setup();

    player.play("correct");
    player.play("correct");

    expect(clip("correct").plays).toBe(2);
    expect(clip("correct").seeks).toEqual([0, 0]);
    expect(clip("wrong").plays).toBe(0);
  });

  it("keeps the tap quieter than the feedback sounds", () => {
    const { clip } = setup();

    expect(clip("tap").volume).toBeLessThan(clip("correct").volume);
  });

  it("stays silent while disabled, and plays again once enabled", () => {
    const { player, clip } = setup();

    player.setEnabled(false);
    player.play("tap");
    expect(clip("tap").plays).toBe(0);

    player.setEnabled(true);
    player.play("tap");
    expect(clip("tap").plays).toBe(1);
  });

  it("never throws when playback fails: it logs instead", () => {
    const { player, clip, log } = setup();
    clip("wrong").play = () => {
      throw new Error("decoder gone");
    };

    expect(() => player.play("wrong")).not.toThrow();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("wrong"), expect.any(Error));
  });

  it("logs a failed seek without throwing", async () => {
    const { player, clip, log } = setup();
    clip("tap").seekTo = () => Promise.reject(new Error("not loaded"));

    player.play("tap");
    await Promise.resolve();
    await Promise.resolve();

    expect(log).toHaveBeenCalled();
    expect(clip("tap").plays).toBe(1);
  });

  it("does not vibrate on web", () => {
    const { player, haptics } = setup("web");

    for (const name of SOUND_NAMES) player.play(name);

    expect(haptics.calls).toEqual([]);
  });

  it("gives iOS a light tap and success / error notifications", () => {
    const { player, haptics } = setup("ios");

    player.play("tap");
    player.play("correct");
    player.play("wrong");

    expect(haptics.calls).toEqual(["impact:light", "notify:success", "notify:error"]);
  });

  it("uses Android's permission-free haptic feedback", () => {
    const { player, haptics } = setup("android");

    player.play("tap");
    player.play("correct");
    player.play("wrong");

    expect(haptics.calls).toEqual(["android:tap", "android:confirm", "android:reject"]);
  });

  it("keeps haptics when sounds are muted (they make no noise)", () => {
    const { player, haptics, clip } = setup("ios");

    player.setEnabled(false);
    player.play("correct");

    expect(clip("correct").plays).toBe(0);
    expect(haptics.calls).toEqual(["notify:success"]);
  });
});
