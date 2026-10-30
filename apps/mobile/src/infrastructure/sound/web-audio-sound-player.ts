import { VOLUMES } from "./device-sound-player";
import { SOUND_NAMES, type SoundName, type SoundPlayer } from "./sound-player";

/** The part of a `Response` this player reads. */
export type SoundResponse = { ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> };

type WebAudioNode = { connect(node: unknown): unknown };

/** The part of an `AudioBufferSourceNode` this player uses. */
export type WebAudioSource = WebAudioNode & { buffer: unknown; start(): void };

/** The part of a Web Audio `AudioContext` this player uses. */
export type WebAudioContext = {
  readonly state: string;
  readonly destination: unknown;
  resume(): Promise<void>;
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
  createGain(): WebAudioNode & { gain: { value: number } };
  createBufferSource(): WebAudioSource;
};

/**
 * `SoundPlayer` for the web over the Web Audio API.
 *
 * Each sound is downloaded once with `fetch`, which the service worker answers from its cache
 * (offline included), and played from memory through an `AudioBufferSourceNode`. No media element
 * loads anything: those loads take the browser's media pipeline, which does not reliably go
 * through the service worker (see the README, "Offline web app").
 *
 * The bytes are fetched right away; the `AudioContext` is created, resumed and used to decode the
 * sounds only on the first `play`, which runs inside the learner's tap (browsers' autoplay
 * policy). A sound asked for before it is ready plays as soon as it is. Every failure is logged
 * and swallowed; `play` never blocks nor throws.
 */
export function createWebAudioSoundPlayer({
  urls,
  fetch,
  createContext,
  log = (message, error) => console.warn(message, error),
  onPlayed,
}: {
  urls: Readonly<Record<SoundName, string>>;
  fetch: (url: string) => Promise<SoundResponse>;
  createContext: () => WebAudioContext;
  log?: (message: string, error: unknown) => void;
  /** Called after a sound started playing (e2e builds count them). */
  onPlayed?: ((name: SoundName) => void) | undefined;
}): SoundPlayer {
  const downloads = new Map<SoundName, Promise<ArrayBuffer>>();
  for (const name of SOUND_NAMES) {
    const download = Promise.resolve()
      .then(() => fetch(urls[name]))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      });
    // Logged when it is played: a sound nobody plays needs no warning.
    download.catch(() => {});
    downloads.set(name, download);
  }

  let context: WebAudioContext | null = null;
  let contextFailed = false;
  const decoded = new Map<SoundName, Promise<unknown>>();
  let enabled = true;

  const audioContext = (): WebAudioContext | null => {
    if (context === null && !contextFailed) {
      try {
        context = createContext();
      } catch (error) {
        contextFailed = true;
        log("Web Audio is not available: sounds are off", error);
      }
    }
    return context;
  };

  const buffer = (ctx: WebAudioContext, name: SoundName) => {
    let pending = decoded.get(name);
    if (pending === undefined) {
      pending = downloads.get(name)!.then((bytes) => ctx.decodeAudioData(bytes));
      decoded.set(name, pending);
    }
    return pending;
  };

  const start = (ctx: WebAudioContext, name: SoundName, audio: unknown) => {
    const gain = ctx.createGain();
    gain.gain.value = VOLUMES[name];
    gain.connect(ctx.destination);
    const source = ctx.createBufferSource();
    source.buffer = audio;
    source.connect(gain);
    source.start();
    onPlayed?.(name);
  };

  return {
    play(name) {
      if (!enabled) return;
      try {
        const ctx = audioContext();
        if (ctx === null) return;
        // Resume synchronously, inside the learner's tap: browsers only unlock audio there.
        if (ctx.state !== "running") {
          ctx.resume().catch((error: unknown) => log("Could not start the audio", error));
        }
        buffer(ctx, name)
          .then((audio) => {
            if (enabled) start(ctx, name, audio);
          })
          .catch((error: unknown) => log(`Could not play the "${name}" sound`, error));
      } catch (error) {
        log(`Could not play the "${name}" sound`, error);
      }
    },
    setEnabled(next) {
      enabled = next;
    },
  };
}
