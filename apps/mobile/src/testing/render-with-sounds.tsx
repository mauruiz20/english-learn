import { render } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { AppServicesProvider, type AppServices } from "@/infrastructure/services/app-services";
import type { SoundPlayer } from "@/infrastructure/sound/sound-player";

/**
 * Renders `ui` with only a sound player in the app's services (enough for buttons and rows). A
 * wrapper, so `rerender` keeps it.
 */
export function renderWithSounds(ui: ReactElement, sounds: SoundPlayer) {
  const services = { sounds } as unknown as AppServices;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppServicesProvider services={services}>{children}</AppServicesProvider>
  );
  return render(ui, { wrapper });
}
