/** What the speech service can do now; read with `useSyncExternalStore`. */
export type SpeechSnapshot = {
  /** An English voice on the device can speak (false: hide every speaker button). */
  readonly available: boolean;
  /** The key of what is being spoken (one speaker button), or null. */
  readonly speakingKey: string | null;
  /** The English voices the learner can pick from, best first (`rankEnglishVoices`). */
  readonly voices: readonly SpeechVoice[];
  /** The voice speaking now: the learner's pick when it is on the device, else the best one. */
  readonly voiceId: string | null;
};

/** One English voice of the device, as the voice picker shows it. */
export type SpeechVoice = {
  /** The voice's `voiceURI`: stable on a device, what the learner's pick stores. */
  readonly id: string;
  readonly name: string;
  readonly lang: string;
};

export type SpeakOptions = {
  /** 1 is the voice's normal speed; below 1 is slower (see `SPEECH_RATES`). */
  readonly rate: number;
  /** Who asked (a speaker button): `speakingKey` while it speaks. */
  readonly key: string;
  /** Speak with this voice (`SpeechVoice.id`) once, e.g. to try it, instead of the one in use. */
  readonly voice?: string | undefined;
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
  /** The learner's voice (`SpeechVoice.id`), or null for the automatic one. */
  setVoice(id: string | null): void;
}

const UNAVAILABLE: SpeechSnapshot = {
  available: false,
  speakingKey: null,
  voices: [],
  voiceId: null,
};

/** No speech at all (native, tests, browsers without an English voice): no speaker buttons. */
export const unsupportedSpeech: SpeechService = {
  getSnapshot: () => UNAVAILABLE,
  subscribe: () => () => {},
  speak: () => {},
  cancel: () => {},
  setVoice: () => {},
};

/** The two speeds a learner can pick. */
export type SpeechRateName = "normal" | "slow";

export const SPEECH_RATES: Readonly<Record<SpeechRateName, number>> = { normal: 1, slow: 0.7 };
