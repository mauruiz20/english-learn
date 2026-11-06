import type { SpeakOptions, SpeechService, SpeechSnapshot, SpeechVoice } from "./speech-service";
import { rankEnglishVoices, splitForSpeech, type VoiceLike } from "./voice-choice";

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
/**
 * How long to let the engine settle after cancelling it before speaking again. WebKit before
 * Safari 27 handled `cancel()` asynchronously and its late callback could drop or cut the
 * utterances queued right after it (https://bugs.webkit.org/show_bug.cgi?id=191745).
 */
export const CANCEL_SETTLE_MS = 100;

/** A generous bound on how long `text` takes to say, for the watchdog (ms). */
function expectedDuration(text: string, rate: number): number {
  return 3_000 + (text.length * 120) / Math.max(rate, 0.1);
}

const sameVoices = (a: readonly SpeechVoice[], b: readonly SpeechVoice[]) =>
  a.length === b.length && a.every((v, i) => v.id === b[i]?.id);

/**
 * `SpeechService` over the Web Speech API (`speechSynthesis`), with what WebKit needs:
 *
 * - **Voices arrive late.** `getVoices()` is often empty at first: the service listens to
 *   `voiceschanged` and also looks again after 0.25, 1 and 3 s (iOS may never fire the event).
 *   It is unavailable (no speaker buttons) until an English voice on the device shows up.
 * - **Voice.** The learner's pick (`setVoice`) when it is on the device, else the best of
 *   `rankEnglishVoices` (never a novelty, Eloquence or network voice).
 * - **A first tap unlocks it.** iOS speaks only from a user gesture and may stay silent (or list
 *   no voices) until something was spoken once: the first tap anywhere in the page speaks an empty,
 *   silent utterance and reads the voices again. `speak` itself is always called inside the tap.
 * - **Cancel, then speak.** An idle engine is never cancelled: the text is spoken at once, inside
 *   the tap. A busy one is cancelled and the text is spoken `CANCEL_SETTLE_MS` later, with fresh
 *   utterances (WebKit bug 191745; the engine already spoke, so it is unlocked).
 * - **Background.** iOS stops speaking when the page is hidden, without an end event: the service
 *   cancels on `visibilitychange` (hidden) and `pagehide`, and a watchdog clears a speaking state
 *   whose end never comes.
 * - **Stuck engines.** A paused engine is resumed before speaking; anything the engine throws is
 *   logged, never thrown.
 *
 * Long texts are queued in sentence chunks.
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
  let ranked: VoiceLike[] = [];
  let preferred: string | null = null;
  let voice: VoiceLike | null = null;
  let snapshot: SpeechSnapshot = { available: false, speakingKey: null, voices: [], voiceId: null };
  // Bumped by every speak and cancel: ends of older utterances are ignored.
  let generation = 0;
  let watchdog: unknown = null;
  let deferred: unknown = null;

  const publish = (next: SpeechSnapshot) => {
    if (
      next.available === snapshot.available &&
      next.speakingKey === snapshot.speakingKey &&
      next.voiceId === snapshot.voiceId &&
      sameVoices(next.voices, snapshot.voices)
    ) {
      return;
    }
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };

  const setSpeaking = (speakingKey: string | null) => publish({ ...snapshot, speakingKey });

  const choose = () => {
    voice = ranked.find((v) => v.voiceURI === preferred) ?? ranked[0] ?? null;
    const voices = ranked.map((v) => ({
      id: v.voiceURI,
      name: v.name,
      lang: v.lang.replace(/_/gu, "-"),
    }));
    publish({
      ...snapshot,
      available: voice !== null,
      // The same list keeps its identity, so subscribers re-render only on a real change.
      voices: sameVoices(voices, snapshot.voices) ? snapshot.voices : voices,
      voiceId: voice?.voiceURI ?? null,
    });
  };

  const refreshVoices = () => {
    if (synth === undefined) return;
    try {
      ranked = rankEnglishVoices(synth.getVoices());
    } catch (error) {
      console.warn("Could not read the speech voices", error);
      ranked = [];
    }
    choose();
  };

  const clearTimers = () => {
    if (watchdog !== null) timers.clearTimeout(watchdog);
    if (deferred !== null) timers.clearTimeout(deferred);
    watchdog = null;
    deferred = null;
  };

  /** Ignores what was being said; cancels the engine only when it is busy (or forced). */
  const stop = (force: boolean) => {
    generation += 1;
    clearTimers();
    let cancelled = false;
    try {
      if (synth !== undefined && (force || synth.speaking || synth.pending)) {
        synth.cancel();
        cancelled = true;
      }
    } catch (error) {
      console.warn("Could not stop speaking", error);
    }
    setSpeaking(null);
    return cancelled;
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
      if (document.hidden === true && snapshot.speakingKey !== null) stop(true);
    });
    window?.addEventListener("pagehide", () => {
      if (snapshot.speakingKey !== null) stop(true);
    });
  }

  /** Queues `chunks` as fresh utterances, each with every property set. */
  const say = (engine: SynthLike, chunks: string[], chosen: VoiceLike, rate: number) => {
    const mine = generation;
    try {
      if (engine.paused) engine.resume();
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
          clearTimers();
          setSpeaking(null);
        };
        utterance.onend = last ? done : null;
        utterance.onerror = done;
        engine.speak(utterance);
      });
    } catch (error) {
      console.warn("Could not speak", error);
      stop(true);
    }
  };

  const speak = (text: string, { rate, key, voice: wanted }: SpeakOptions) => {
    if (synth === undefined || voice === null) return;
    const chunks = splitForSpeech(text);
    if (chunks.length === 0) return;
    const chosen =
      (wanted === undefined ? undefined : ranked.find((v) => v.voiceURI === wanted)) ?? voice;
    // Ends of what was being said are ignored from here.
    const cancelled = stop(false);
    const mine = generation;
    setSpeaking(key);
    if (cancelled) {
      deferred = timers.setTimeout(() => {
        deferred = null;
        if (generation === mine) say(synth, chunks, chosen, rate);
      }, CANCEL_SETTLE_MS);
    } else {
      say(synth, chunks, chosen, rate);
    }
    if (generation !== mine) return;
    watchdog = timers.setTimeout(
      () => {
        if (generation === mine) setSpeaking(null);
      },
      CANCEL_SETTLE_MS + expectedDuration(text, rate),
    );
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    speak,
    cancel: () => {
      stop(true);
    },
    setVoice: (id) => {
      preferred = id;
      choose();
    },
  };
}
