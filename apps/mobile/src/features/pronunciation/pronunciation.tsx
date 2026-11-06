import type { SpeechRate } from "@english-learn/domain";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAppServices } from "@/infrastructure/services/app-services";
import {
  SPEECH_RATES,
  unsupportedSpeech,
  type SpeechService,
} from "@/infrastructure/speech/speech-service";

export type Pronunciation = {
  /** The device has an English voice (otherwise nothing about pronunciation shows). */
  readonly supported: boolean;
  /** The learner's "Pronunciación" switch (on by default). */
  readonly enabled: boolean;
  /** Speaker buttons show: supported and switched on. */
  readonly available: boolean;
  /** The stored switch and speed were read (or could not be): `available` is final for now. */
  readonly ready: boolean;
  /** The learner's speed. */
  readonly rate: SpeechRate;
  /** Which speaker is speaking now (its key), or null. */
  readonly speakingKey: string | null;
  /** Speaks `text` (cancelling anything else) at `rate`, or the learner's speed. */
  readonly speak: (text: string, key: string, rate?: SpeechRate) => void;
  readonly setEnabled: (enabled: boolean) => void;
  readonly setRate: (rate: SpeechRate) => void;
};

const PronunciationContext = createContext<Pronunciation | null>(null);

const noop = () => {};

/** Outside the provider (screens rendered alone in tests, the placement test): nothing shows. */
const UNAVAILABLE: Pronunciation = {
  supported: false,
  enabled: false,
  available: false,
  ready: true,
  rate: "normal",
  speakingKey: null,
  speak: noop,
  setEnabled: noop,
  setRate: noop,
};

/**
 * Holds the learner's pronunciation choices for the whole app (the "Pronunciación" switch and the
 * voice speed): reads them once from the settings repository and saves every change, and
 * combines them with what the device's speech service can do. Switching it off stops any speech.
 */
export function PronunciationProvider({ children }: { children: ReactNode }) {
  const services = useAppServices();
  const { settingsRepository } = services;
  const speech: SpeechService = services.speech ?? unsupportedSpeech;
  const snapshot = useSyncExternalStore(speech.subscribe, speech.getSnapshot, speech.getSnapshot);
  const [enabled, setEnabledState] = useState(true);
  const [rate, setRateState] = useState<SpeechRate>("normal");
  const [ready, setReady] = useState(false);
  // A choice made before the stored one is read wins over it.
  const touched = useRef({ enabled: false, rate: false });

  useEffect(() => {
    let active = true;
    Promise.all([settingsRepository.getPronunciationEnabled(), settingsRepository.getSpeechRate()])
      .then(([storedEnabled, storedRate]) => {
        if (!active) return;
        if (!touched.current.enabled) setEnabledState(storedEnabled);
        if (!touched.current.rate) setRateState(storedRate);
      })
      .catch((error: unknown) => console.warn("Failed to read the pronunciation settings", error))
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [settingsRepository]);

  const setEnabled = useCallback(
    (next: boolean) => {
      touched.current.enabled = true;
      setEnabledState(next);
      if (!next) speech.cancel();
      settingsRepository
        .setPronunciationEnabled(next)
        .catch((error: unknown) => console.warn("Failed to save the pronunciation switch", error));
    },
    [settingsRepository, speech],
  );

  const setRate = useCallback(
    (next: SpeechRate) => {
      touched.current.rate = true;
      setRateState(next);
      settingsRepository
        .setSpeechRate(next)
        .catch((error: unknown) => console.warn("Failed to save the speech rate", error));
    },
    [settingsRepository],
  );

  const available = snapshot.available && enabled;
  const speak = useCallback(
    (text: string, key: string, at?: SpeechRate) => {
      if (!available) return;
      speech.speak(text, { key, rate: SPEECH_RATES[at ?? rate] });
    },
    [available, rate, speech],
  );

  const value = useMemo<Pronunciation>(
    () => ({
      supported: snapshot.available,
      enabled,
      available,
      ready,
      rate,
      speakingKey: snapshot.speakingKey,
      speak,
      setEnabled,
      setRate,
    }),
    [snapshot, enabled, available, ready, rate, speak, setEnabled, setRate],
  );

  return <PronunciationContext value={value}>{children}</PronunciationContext>;
}

/** The pronunciation choices and speech; never throws (unavailable outside the provider). */
export function usePronunciation(): Pronunciation {
  return use(PronunciationContext) ?? UNAVAILABLE;
}
