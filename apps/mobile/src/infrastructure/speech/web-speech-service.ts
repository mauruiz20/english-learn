import type { SpeakOptions, SpeechService, SpeechSnapshot } from "./speech-service";
import { pickEnglishVoice, splitForSpeech, type VoiceLike } from "./voice-choice";

/** The parts of a `SpeechSynthesisUtterance` the service sets. */
export type UtteranceLike = {
  text: string;
  lang: string;
  voice: VoiceLike | null;
  rate: number;
  pitch: number;
  volume: number;
  onstart: ((event: unknown) => void) | null;
  onend: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
};

/** The parts of `window.speechSynthesis` the service uses. */
export type SynthLike = {
  readonly speaking: boolean;
  readonly pending: boolean;
  readonly paused: boolean;
  getVoices(): readonly VoiceLike[];
  speak(utterance: UtteranceLike): void;
  cancel(): void;
  resume(): void;
  addEventListener?: (type: "voiceschanged", listener: () => void) => void;
  onvoiceschanged?: unknown;
};

type TargetLike = {
  addEventListener(type: string, listener: () => void, options?: unknown): void;
  removeEventListener(type: string, listener: () => void, options?: unknown): void;
};

type Timers = {
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
};

/** When to look at the voices again if `voiceschanged` never fires (some iOS versions). */
const VOICE_RETRIES_MS = [250, 1_000, 3_000];
/** After the first tap primes the engine, when to read the voices it may have loaded. */
const AFTER_PRIME_MS = 100;
/** The gestures that count as the learner's first tap (iOS needs one to start speaking). */
const GESTURES = ["pointerdown", "touchend", "keydown"] as const;

/** A generous bound on how long `text` takes to say, for the watchdog (ms). */
function expectedDuration(text: string, rate: number): number {
  return 3_000 + (text.length * 120) / Math.max(rate, 0.1);
}

/**
 * `SpeechService` over the Web Speech API (`speechSynthesis`), with what WebKit needs:
 *
 * - **Voices arrive late.** `getVoices()` is often empty at first: the service listens to
 *   `voiceschanged` and also looks again after 0.25, 1 and 3 s (iOS may never fire the event).
 *   It is unavailable (no speaker buttons) until an English voice on the device shows up.
 * - **A first tap unlocks it.** iOS speaks only from a user gesture and may stay silent (or list
 *   no voices) until something was spoken once: the first tap anywhere in the page speaks an empty,
 *   silent utterance and reads the voices again. `speak` itself is always called inside the tap.
 * - **Background.** iOS stops speaking when the page is hidden, without an end event: the service
 *   cancels on `visibilitychange` (hidden) and `pagehide`, and a watchdog clears a speaking state
 *   whose end never comes.
 * - **Stuck engines.** A paused engine is resumed before speaking; anything the engine throws is
 *   logged, never thrown.
 *
 * Every `speak` cancels what was being said first; long texts are queued in sentence chunks.
 */
export function createWebSpeechService({
  synth,
  createUtterance,
  document,
  window,
  timers,
}: {
  synth: SynthLike | undefined;
  createUtterance: (text: string) => UtteranceLike;
  /** Where the first tap and visibility changes are heard (`window.document`). */
  document?: (TargetLike & { readonly hidden?: boolean }) | undefined;
  /** Where `pagehide` is heard. */
  window?: TargetLike | undefined;
  timers: Timers;
}): SpeechService {
  const listeners = new Set<() => void>();
  let voice: VoiceLike | null = null;
  let snapshot: SpeechSnapshot = { available: false, speakingKey: null };
  // Bumped by every speak and cancel: ends of older utterances are ignored.
  let generation = 0;
  let watchdog: unknown = null;

  const publish = (next: SpeechSnapshot) => {
    if (next.available === snapshot.available && next.speakingKey === snapshot.speakingKey) {
      return;
    }
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };

  const setSpeaking = (speakingKey: string | null) => publish({ ...snapshot, speakingKey });

  const refreshVoices = () => {
    if (synth === undefined) return;
    try {
      voice = pickEnglishVoice(synth.getVoices());
    } catch (error) {
      console.warn("Could not read the speech voices", error);
      voice = null;
    }
    publish({ ...snapshot, available: voice !== null });
  };

  const clearWatchdog = () => {
    if (watchdog !== null) timers.clearTimeout(watchdog);
    watchdog = null;
  };

  const stop = () => {
    generation += 1;
    clearWatchdog();
    try {
      synth?.cancel();
    } catch (error) {
      console.warn("Could not stop speaking", error);
    }
    setSpeaking(null);
  };

  if (synth !== undefined) {
    refreshVoices();
    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", refreshVoices);
    } else if ("onvoiceschanged" in synth) {
      (synth as { onvoiceschanged: unknown }).onvoiceschanged = refreshVoices;
    }
    for (const ms of VOICE_RETRIES_MS) {
      timers.setTimeout(() => {
        if (voice === null) refreshVoices();
      }, ms);
    }

    // The first tap primes the engine (iOS), once.
    const prime = () => {
      for (const type of GESTURES) document?.removeEventListener(type, prime, true);
      try {
        const silent = createUtterance("");
        silent.volume = 0;
        synth.speak(silent);
      } catch (error) {
        console.warn("Could not prime speech", error);
      }
      timers.setTimeout(refreshVoices, AFTER_PRIME_MS);
    };
    for (const type of GESTURES) document?.addEventListener(type, prime, true);

    document?.addEventListener("visibilitychange", () => {
      if (document.hidden === true && snapshot.speakingKey !== null) stop();
    });
    window?.addEventListener("pagehide", () => {
      if (snapshot.speakingKey !== null) stop();
    });
  }

  const speak = (text: string, { rate, key }: SpeakOptions) => {
    if (synth === undefined || voice === null) return;
    const chunks = splitForSpeech(text);
    if (chunks.length === 0) return;
    // Cancel whatever was being said (ends of its utterances are ignored from here).
    stop();
    const mine = generation;
    const chosen = voice;
    try {
      if (synth.paused) synth.resume();
      chunks.forEach((chunk, i) => {
        const utterance = createUtterance(chunk);
        utterance.voice = chosen;
        utterance.lang = chosen.lang.replace(/_/gu, "-");
        utterance.rate = rate;
        utterance.pitch = 1;
        utterance.volume = 1;
        const last = i === chunks.length - 1;
        const done = () => {
          if (generation !== mine) return;
          // An error ends the whole text; a chunk's end only matters for the last one.
          clearWatchdog();
          setSpeaking(null);
        };
        utterance.onend = last ? done : null;
        utterance.onerror = done;
        synth.speak(utterance);
      });
    } catch (error) {
      console.warn("Could not speak", error);
      stop();
      return;
    }
    setSpeaking(key);
    watchdog = timers.setTimeout(
      () => {
        if (generation === mine) setSpeaking(null);
      },
      expectedDuration(text, rate),
    );
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    speak,
    cancel: stop,
  };
}
