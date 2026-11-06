import { act, render } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { PronunciationProvider } from "@/features/pronunciation/pronunciation";
import { AppServicesProvider, type AppServices } from "@/infrastructure/services/app-services";
import { createFakeSettingsRepository } from "./fake-settings-repository";
import { createFakeSoundPlayer } from "./fake-sound-player";
import { createFakeSpeech, type FakeSpeech } from "./fake-speech";

/**
 * Renders `ui` under the pronunciation provider with a fake speech service (an English voice by
 * default) and in-memory settings, then lets the stored settings load.
 */
export async function renderWithPronunciation(
  ui: ReactElement,
  {
    speech = createFakeSpeech(),
    settings = createFakeSettingsRepository(),
    services = {},
  }: {
    speech?: FakeSpeech;
    settings?: ReturnType<typeof createFakeSettingsRepository>;
    services?: Partial<AppServices>;
  } = {},
) {
  const all = {
    settingsRepository: settings,
    sounds: createFakeSoundPlayer(),
    speech,
    ...services,
  } as unknown as AppServices;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppServicesProvider services={all}>
      <PronunciationProvider>{children}</PronunciationProvider>
    </AppServicesProvider>
  );
  const result = await render(ui, { wrapper });
  await act(async () => {});
  return { ...result, speech, settings };
}
