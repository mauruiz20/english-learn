import type { SpeechService, SpeechSnapshot } from "@/infrastructure/speech/speech-service";

export type FakeSpeech = SpeechService & {
  /** Everything spoken, in order. */
  readonly spoken: { text: string; rate: number; key: string }[];
  readonly cancels: () => number;
  /** Ends what is being spoken (as the engine's `end` event would). */
  finish(): void;
  /** Voices loaded (or went away) later. */
  setAvailable(available: boolean): void;
};

/** A `SpeechService` that records what a test makes it say. */
export function createFakeSpeech({ available = true }: { available?: boolean } = {}): FakeSpeech {
  const listeners = new Set<() => void>();
  const spoken: { text: string; rate: number; key: string }[] = [];
  let cancels = 0;
  let snapshot: SpeechSnapshot = { available, speakingKey: null };
  const publish = (next: SpeechSnapshot) => {
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    spoken,
    cancels: () => cancels,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    speak: (text, { rate, key }) => {
      if (!snapshot.available) return;
      cancels += 1;
      spoken.push({ text, rate, key });
      publish({ ...snapshot, speakingKey: key });
    },
    cancel: () => {
      cancels += 1;
      if (snapshot.speakingKey !== null) publish({ ...snapshot, speakingKey: null });
    },
    finish: () => publish({ ...snapshot, speakingKey: null }),
    setAvailable: (next) => publish({ ...snapshot, available: next }),
  };
}
