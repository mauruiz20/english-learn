import { SOUND_NAMES, type SoundName, type SoundPlayer } from "./sound-player";

/** The part of an expo-audio `AudioPlayer` this player uses. */
export type AudioClip = {
  volume: number;
  play(): void;
  seekTo(seconds: number): Promise<void>;
};

export type HapticNotification = "success" | "warning" | "error";
export type AndroidHaptic = "tap" | "confirm" | "reject";

/** The haptic feedback this player uses (see `expo-sound-player.ts` for the real one). */
export type HapticsPort = {
  /** iOS: a light impact. */
  impactLight(): Promise<void>;
  /** iOS: a notification feedback. */
  notify(type: HapticNotification): Promise<void>;
  /** Android: system haptic feedback, which needs no VIBRATE permission. */
  android(type: AndroidHaptic): Promise<void>;
};

/** Clip volume per sound: the tap is a whisper, the rest sit just under full volume. */
const VOLUMES: Readonly<Record<SoundName, number>> = {
  tap: 0.35,
  correct: 0.8,
  almost: 0.8,
  wrong: 0.7,
  complete: 0.85,
  streak: 0.8,
};

const IOS_HAPTICS: Readonly<Record<SoundName, "light" | HapticNotification | null>> = {
  tap: "light",
  correct: "success",
  almost: "warning",
  wrong: "error",
  complete: "success",
  streak: null,
};

const ANDROID_HAPTICS: Readonly<Record<SoundName, AndroidHaptic | null>> = {
  tap: "tap",
  correct: "confirm",
  almost: null,
  wrong: "reject",
  complete: "confirm",
  streak: null,
};

/**
 * `SoundPlayer` over preloaded audio clips plus haptic feedback on iOS and Android (none on
 * web). Muting silences the clips only: haptics make no noise. Every failure is logged and
 * swallowed.
 */
export function createDeviceSoundPlayer({
  os,
  createClip,
  haptics,
  log = (message, error) => console.warn(message, error),
}: {
  os: string;
  createClip: (name: SoundName) => AudioClip;
  haptics: HapticsPort;
  log?: (message: string, error: unknown) => void;
}): SoundPlayer {
  const clips = new Map<SoundName, AudioClip>();
  for (const name of SOUND_NAMES) {
    try {
      const clip = createClip(name);
      clip.volume = VOLUMES[name];
      clips.set(name, clip);
    } catch (error) {
      log(`Could not load the "${name}" sound`, error);
    }
  }
  let enabled = true;

  const vibrate = (name: SoundName) => {
    let feedback: Promise<void> | null = null;
    if (os === "ios") {
      const type = IOS_HAPTICS[name];
      if (type !== null) feedback = type === "light" ? haptics.impactLight() : haptics.notify(type);
    } else if (os === "android") {
      const type = ANDROID_HAPTICS[name];
      if (type !== null) feedback = haptics.android(type);
    }
    feedback?.catch((error: unknown) => log(`Haptic feedback "${name}" failed`, error));
  };

  return {
    play(name) {
      try {
        vibrate(name);
      } catch (error) {
        log(`Haptic feedback "${name}" failed`, error);
      }
      const clip = clips.get(name);
      if (!enabled || clip === undefined) return;
      try {
        // Rewind and play synchronously: web browsers only allow playback inside the user's tap.
        clip
          .seekTo(0)
          .catch((error: unknown) => log(`Could not rewind the "${name}" sound`, error));
        clip.play();
      } catch (error) {
        log(`Could not play the "${name}" sound`, error);
      }
    },
    setEnabled(next) {
      enabled = next;
    },
  };
}
