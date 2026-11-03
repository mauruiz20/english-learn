import { Asset } from "expo-asset";
import type * as E2eSoundLog from "./e2e-sound-log";
import type { SoundName, SoundPlayer } from "./sound-player";
import { createWebAudioSoundPlayer } from "./web-audio-sound-player";

// Same bundled files as on native (`expo-sound-player.ts`): same-origin, precached by the service
// worker, so COEP `require-corp` allows them and they load offline.
const SOURCES: Readonly<Record<SoundName, number>> = {
  tap: require("../../../assets/sounds/tap.wav"),
  press: require("../../../assets/sounds/press.wav"),
  correct: require("../../../assets/sounds/correct.wav"),
  almost: require("../../../assets/sounds/almost.wav"),
  wrong: require("../../../assets/sounds/wrong.wav"),
  complete: require("../../../assets/sounds/complete.wav"),
  streak: require("../../../assets/sounds/streak.wav"),
  achievement: require("../../../assets/sounds/achievement.wav"),
};

/** Where each sound is served from, resolved once. */
function soundUrls(): Record<SoundName, string> {
  const urls = {} as Record<SoundName, string>;
  for (const name of Object.keys(SOURCES) as SoundName[]) {
    urls[name] = Asset.fromModule(SOURCES[name]).uri;
  }
  return urls;
}

/**
 * The web `SoundPlayer` (Metro picks this file over `expo-sound-player.ts` on web): the sounds
 * are fetched (through the service worker) and played with Web Audio instead of expo-audio's
 * `HTMLAudioElement`s, whose media loads bypass the worker in WebKit. No haptics on web.
 */
export function createExpoSoundPlayer(): SoundPlayer {
  // `EXPO_PUBLIC_E2E` is inlined at build time: production builds drop this branch and its module.
  let onPlayed: ((name: SoundName) => void) | undefined;
  if (process.env.EXPO_PUBLIC_E2E === "1") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    onPlayed = (require("./e2e-sound-log") as typeof E2eSoundLog).recordPlayedSound;
  }
  return createWebAudioSoundPlayer({
    urls: soundUrls(),
    fetch: (url) => globalThis.fetch(url),
    createContext: () => new AudioContext(),
    onPlayed,
  });
}
