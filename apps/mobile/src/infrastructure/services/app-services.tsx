import type { Clock, ProgressRepository, Rng, SettingsRepository } from "@english-learn/domain";
import { createContext, use, type ReactNode } from "react";
import type { RandomBytes } from "@/features/progress/progress-events";
import { silentSoundPlayer, type SoundPlayer } from "../sound/sound-player";

/** Side-effect services features depend on. Injected so tests can pass in-memory fakes. */
export type AppServices = {
  readonly progressRepository: ProgressRepository;
  readonly clock: Clock;
  /** Random source in [0, 1) for shuffling options; tests inject a deterministic one. */
  readonly random: Rng;
  /** Cryptographically secure bytes for event and session ids (UUIDv7). */
  readonly randomBytes: RandomBytes;
  /** This install's id, stamped on every progress event it writes (read once at start). */
  readonly deviceId: string;
  /** App preferences (sound on/off). */
  readonly settingsRepository: SettingsRepository;
  /** Interaction sounds and haptics. */
  readonly sounds: SoundPlayer;
};

const AppServicesContext = createContext<AppServices | null>(null);

export function AppServicesProvider({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}) {
  return <AppServicesContext value={services}>{children}</AppServicesContext>;
}

export function useAppServices(): AppServices {
  const services = use(AppServicesContext);
  if (services === null) {
    throw new Error("useAppServices must be used inside <AppServicesProvider>");
  }
  return services;
}

/**
 * The sound player, or a silent one outside `AppServicesProvider` (exercise components rendered
 * on their own, e.g. in tests): a missing sound never breaks the UI.
 */
export function useSoundPlayer(): SoundPlayer {
  return use(AppServicesContext)?.sounds ?? silentSoundPlayer;
}
