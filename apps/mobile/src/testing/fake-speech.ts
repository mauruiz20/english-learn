import type {
  SpeechService,
  SpeechSnapshot,
  SpeechVoice,
} from "@/infrastructure/speech/speech-service";

export type FakeSpeech = SpeechService & {
  /** Everything spoken, in order (`voice`: the voice id it was spoken with). */
  readonly spoken: { text: string; rate: number; key: string; voice: string | null }[];
  readonly cancels: () => number;
  /** The learner's voice as last set (null: automatic). */
  readonly preferredVoice: () => string | null;
  /** Ends what is being spoken (as the engine's `end` event would). */
  finish(): void;
  /** Voices loaded (or went away) later. */
  setAvailable(available: boolean): void;
};

/** The voices a fake offers by default, best first. */
export const FAKE_VOICES: readonly SpeechVoice[] = [
  { id: "com.apple.voice.compact.en-US.Samantha", name: "Samantha", lang: "en-US" },
  { id: "com.apple.voice.compact.en-GB.Daniel", name: "Daniel", lang: "en-GB" },
];

/** A `SpeechService` that records what a test makes it say. */
export function createFakeSpeech({
  available = true,
  voices = FAKE_VOICES,
}: { available?: boolean; voices?: readonly SpeechVoice[] } = {}): FakeSpeech {
  const listeners = new Set<() => void>();
  const spoken: FakeSpeech["spoken"] = [];
  let cancels = 0;
  let preferred: string | null = null;
  const inUse = () => (voices.find((v) => v.id === preferred) ?? voices[0])?.id ?? null;
  let snapshot: SpeechSnapshot = {
    available,
    speakingKey: null,
    voices: available ? voices : [],
    voiceId: available ? inUse() : null,
  };
  const publish = (next: SpeechSnapshot) => {
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    spoken,
    cancels: () => cancels,
    preferredVoice: () => preferred,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    speak: (text, { rate, key, voice }) => {
      if (!snapshot.available) return;
      cancels += 1;
      spoken.push({ text, rate, key, voice: voice ?? snapshot.voiceId });
      publish({ ...snapshot, speakingKey: key });
    },
    cancel: () => {
      cancels += 1;
      if (snapshot.speakingKey !== null) publish({ ...snapshot, speakingKey: null });
    },
    setVoice: (id) => {
      preferred = id;
      publish({ ...snapshot, voiceId: snapshot.available ? inUse() : null });
    },
    finish: () => publish({ ...snapshot, speakingKey: null }),
    setAvailable: (next) =>
      publish({
        ...snapshot,
        available: next,
        voices: next ? voices : [],
        voiceId: next ? inUse() : null,
      }),
  };
}
