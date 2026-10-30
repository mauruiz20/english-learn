import type { SoundName } from "./sound-player";

/**
 * Test-only: records each sound the web player started in `window.__e2e.playedSounds`, so e2e
 * specs can check sounds really played (offline included). Wired in only when the web build is
 * exported with `EXPO_PUBLIC_E2E=1` (see `expo-sound-player.web.ts`); never in production.
 */
export function recordPlayedSound(name: SoundName): void {
  const host = globalThis as unknown as { __e2e?: { playedSounds?: SoundName[] } };
  host.__e2e ??= {};
  host.__e2e.playedSounds ??= [];
  host.__e2e.playedSounds.push(name);
}
