import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import { useAppServices } from "@/infrastructure/services/app-services";

type SoundPreference = {
  /** Sounds are on (the default until the stored preference says otherwise). */
  readonly enabled: boolean;
  /** Turns sounds on or off, for the player and on the device. */
  readonly toggle: () => void;
};

const SoundPreferenceContext = createContext<SoundPreference | null>(null);

/**
 * Holds the learner's sound on/off choice for the whole app: reads it once from the settings
 * repository, applies it to the sound player, and saves every change.
 */
export function SoundPreferenceProvider({ children }: { children: ReactNode }) {
  const { settingsRepository, sounds } = useAppServices();
  const [enabled, setEnabled] = useState(true);
  // A choice made before the stored one is read wins over it.
  const touched = useRef(false);

  useEffect(() => {
    let active = true;
    settingsRepository.getSoundEnabled().then(
      (stored) => {
        if (!active || touched.current) return;
        sounds.setEnabled(stored);
        setEnabled(stored);
      },
      (error: unknown) => console.warn("Failed to read the sound setting", error),
    );
    return () => {
      active = false;
    };
  }, [settingsRepository, sounds]);

  const toggle = () => {
    touched.current = true;
    const next = !enabled;
    sounds.setEnabled(next);
    setEnabled(next);
    settingsRepository
      .setSoundEnabled(next)
      .catch((error: unknown) => console.warn("Failed to save the sound setting", error));
  };

  return <SoundPreferenceContext value={{ enabled, toggle }}>{children}</SoundPreferenceContext>;
}

export function useSoundPreference(): SoundPreference {
  const preference = use(SoundPreferenceContext);
  if (preference === null) {
    throw new Error("useSoundPreference must be used inside <SoundPreferenceProvider>");
  }
  return preference;
}
