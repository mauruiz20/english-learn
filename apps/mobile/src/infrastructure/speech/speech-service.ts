/** What the speech service can do now; read with `useSyncExternalStore`. */
export type SpeechSnapshot = {
  /** An English voice on the device can speak (false: hide every speaker button). */
  readonly available: boolean;
  /** The key of what is being spoken (one speaker button), or null. */
  readonly speakingKey: string | null;
};

export type SpeakOptions = {
  /** 1 is the voice's normal speed; 0.7 is slow. */
  readonly rate: number;
  /** Who asked (a speaker button): `speakingKey` while it speaks. */
  readonly key: string;
};

/**
 * English pronunciation with the device's own speech synthesis (no network, no recordings).
 * Fire and forget: `speak` never blocks nor throws, and cancels whatever was being said first.
 * Injected through `AppServices`, so tests use a fake.
 */
export interface SpeechService {
  getSnapshot(): SpeechSnapshot;
  /** Calls `listener` whenever the snapshot changes; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  speak(text: string, options: SpeakOptions): void;
  cancel(): void;
}

const UNAVAILABLE: SpeechSnapshot = { available: false, speakingKey: null };

/** No speech at all (native, tests, browsers without an English voice): no speaker buttons. */
export const unsupportedSpeech: SpeechService = {
  getSnapshot: () => UNAVAILABLE,
  subscribe: () => () => {},
  speak: () => {},
  cancel: () => {},
};

/** The two speeds a learner can pick. */
export type SpeechRateName = "normal" | "slow";

export const SPEECH_RATES: Readonly<Record<SpeechRateName, number>> = { normal: 1, slow: 0.7 };
