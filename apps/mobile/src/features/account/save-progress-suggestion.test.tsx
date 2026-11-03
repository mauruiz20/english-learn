import type { AccountMarker } from "@english-learn/domain";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { testRandomBytes } from "@/testing/random-bytes";
import { AccountContext, type AccountContextValue } from "./account-context";
import { SaveProgressSuggestion } from "./save-progress-suggestion";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

type Settings = ReturnType<typeof createFakeSettingsRepository>;

function renderSuggestion({
  settings = createFakeSettingsRepository(),
  availability = "available",
  account = null,
}: {
  settings?: Settings;
  availability?: AccountContextValue["availability"];
  account?: AccountMarker | null;
} = {}) {
  const value: AccountContextValue = {
    availability,
    session: account === null ? { status: "signed-out" } : { status: "signed-in", account },
    syncStatus: { kind: "idle" },
    progressVersion: 0,
    actions: null,
  };
  return render(
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
      <AccountContext value={value}>
        <SaveProgressSuggestion />
      </AccountContext>
    </AppServicesProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe("SaveProgressSuggestion", () => {
  it("suggests an account once, then never again", async () => {
    const settings = createFakeSettingsRepository();
    const first = await renderSuggestion({ settings });

    expect(await screen.findByText("Guarda tu progreso")).toBeOnTheScreen();
    await first.unmount();

    await renderSuggestion({ settings });
    expect(screen.queryByText("Guarda tu progreso")).toBeNull();
  });

  it("opens the account page", async () => {
    await renderSuggestion();

    await fireEvent.press(await screen.findByRole("button", { name: "Crear mi cuenta" }));

    expect(mockPush).toHaveBeenCalledWith("/cuenta");
  });

  it("can be dismissed", async () => {
    await renderSuggestion();

    await fireEvent.press(await screen.findByRole("button", { name: "Ahora no" }));

    expect(screen.queryByText("Guarda tu progreso")).toBeNull();
  });

  it.each([
    ["signed in", { account: { userId: "u", email: "a@b.c" } }],
    ["on another site", { availability: "wrong-origin" as const }],
    ["in the native app", { availability: "native" as const }],
  ])("is not shown %s", async (_, options) => {
    const settings = createFakeSettingsRepository();
    await renderSuggestion({ settings, ...options });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("Guarda tu progreso")).toBeNull();
    expect(settings.saveProgressSuggestionDismissed()).toBe(false);
  });
});
