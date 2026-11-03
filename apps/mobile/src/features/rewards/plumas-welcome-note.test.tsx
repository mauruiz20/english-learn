import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { testRandomBytes } from "@/testing/random-bytes";
import { palettes } from "@/shared/ui/theme";
import { PLUMAS_NOTE_COLOR, PlumasWelcomeNote } from "./plumas-welcome-note";

/** WCAG 2 contrast ratio of two `#RRGGBB` colors. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r = 0, g = 0, bl = 0] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = "Avi te guardó 135 plumas por lo que ya estudiaste.";

async function renderNote(earned: number | null, settings = createFakeSettingsRepository()) {
  return {
    settings,
    ...(await render(
      <AppServicesProvider
        services={{
          progressRepository: createFakeRepository(),
          clock: { today: () => "2026-10-30" as never, nowMs: () => 0 },
          random: () => 0,
          randomBytes: testRandomBytes,
          deviceId: "d",
          settingsRepository: settings,
          sounds: createFakeSoundPlayer(),
        }}
      >
        <PlumasWelcomeNote earned={earned} />
      </AppServicesProvider>,
    )),
  };
}

describe("PlumasWelcomeNote", () => {
  it("reads on its sticky note: the text and the paper key's ink pass AA (always light)", () => {
    const { text, ink, sheet, highlighters } = palettes.light;
    expect(contrast(text, highlighters[PLUMAS_NOTE_COLOR])).toBeGreaterThanOrEqual(4.5);
    // "Entendido" is a secondary button: ink on white paper, never ink on the highlighter.
    expect(contrast(ink, sheet)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, highlighters[PLUMAS_NOTE_COLOR])).toBeLessThan(4.5);
  });

  it("tells a learner with study from before plumas what Avi kept, once, until dismissed", async () => {
    const { settings } = await renderNote(135);

    expect(await screen.findByText(TEXT)).toBeOnTheScreen();
    expect(settings.plumasWelcome()).toEqual({ plumas: 135, dismissed: false });

    const ok = screen.getByRole("button", { name: "Entendido" });
    fireEvent.press(ok);

    await waitFor(() => expect(screen.queryByText(TEXT)).not.toBeOnTheScreen());
    expect(settings.plumasWelcome()).toEqual({ plumas: 135, dismissed: true });
  });

  it("keeps the first amount on later visits until it is dismissed", async () => {
    await renderNote(
      160,
      createFakeSettingsRepository({ plumasWelcome: { plumas: 135, dismissed: false } }),
    );

    expect(await screen.findByText(TEXT)).toBeOnTheScreen();
  });

  it("never shows to a new learner, nor once dismissed", async () => {
    const fresh = await renderNote(0);
    await waitFor(() =>
      expect(fresh.settings.plumasWelcome()).toEqual({ plumas: 0, dismissed: true }),
    );
    expect(screen.queryByText(/Avi te guardó/)).not.toBeOnTheScreen();
    await fresh.unmount();

    await renderNote(
      135,
      createFakeSettingsRepository({ plumasWelcome: { plumas: 135, dismissed: true } }),
    );
    await waitFor(() => expect(screen.queryByText(/Avi te guardó/)).not.toBeOnTheScreen());
  });

  it("decides nothing while the progress loads", async () => {
    const { settings } = await renderNote(null);

    await waitFor(() => expect(settings.plumasWelcome()).toBeNull());
    expect(screen.queryByText(/Avi te guardó/)).not.toBeOnTheScreen();
  });
});
