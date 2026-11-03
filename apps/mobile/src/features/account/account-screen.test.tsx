import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AccountContext, type AccountActions, type AccountContextValue } from "./account-context";
import { AccountScreen } from "./account-screen";

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockParams,
}));

const NOW = Date.parse("2026-10-30T12:00:00Z");

function fakeActions(overrides: Partial<AccountActions> = {}): jest.Mocked<AccountActions> {
  return {
    startSignIn: jest.fn(),
    completeSignIn: jest.fn(async () => "/cuenta"),
    signOut: jest.fn(async () => {}),
    deleteAccount: jest.fn(async () => "deleted" as const),
    syncNow: jest.fn(async () => {}),
    ...overrides,
  } as jest.Mocked<AccountActions>;
}

const SIGNED_IN = {
  status: "signed-in",
  account: { userId: "u1", email: "ana@example.com" },
} as const;

async function renderScreen(value: Partial<AccountContextValue> = {}) {
  const actions = (value.actions ?? fakeActions()) as jest.Mocked<AccountActions>;
  const context: AccountContextValue = {
    availability: "available",
    session: { status: "signed-out" },
    syncStatus: { kind: "idle" },
    progressVersion: 0,
    ...value,
    actions:
      value.availability === "native" || value.availability === "wrong-origin" ? null : actions,
  };
  const view = await render(
    <AccountContext value={context}>
      <AccountScreen now={() => NOW} />
    </AccountContext>,
  );
  return { ...view, actions };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe("AccountScreen", () => {
  it("offers Google sign-in when signed out, with what is stored and the privacy policy", async () => {
    const { actions } = await renderScreen();

    expect(screen.getByText("Guarda tu progreso y úsalo en otros dispositivos.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Continuar con Google" }));
    // A finished sign-in lands on home, where the greeting says hello by name.
    expect(actions.startSignIn).toHaveBeenCalledWith("/");

    await fireEvent.press(screen.getByRole("link", { name: "Política de privacidad" }));
    expect(mockPush).toHaveBeenCalledWith("/privacidad");
  });

  it("says accounts are coming to the Android app, with no sign-in", async () => {
    await renderScreen({ availability: "native" });

    expect(screen.getByText("Disponible próximamente en la app")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Continuar con Google" })).toBeNull();
  });

  it("points to the app's own site on another site, with no sign-in", async () => {
    await renderScreen({ availability: "wrong-origin" });

    expect(screen.getByText("Las cuentas están en english.maumar.com.ar")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Continuar con Google" })).toBeNull();
  });

  it("shows the account and when it last synced", async () => {
    await renderScreen({ session: SIGNED_IN, syncStatus: { kind: "synced", at: NOW - 120_000 } });

    expect(screen.getByText("ana@example.com")).toBeOnTheScreen();
    expect(screen.getByText("Sincronizado hace 2 min")).toBeOnTheScreen();
  });

  it("explains that it syncs when the connection comes back", async () => {
    await renderScreen({ session: SIGNED_IN, syncStatus: { kind: "offline" } });

    expect(screen.getByText("Sin conexión, se sincroniza al volver")).toBeOnTheScreen();
  });

  it("offers a retry after a sync error", async () => {
    const { actions } = await renderScreen({
      session: SIGNED_IN,
      syncStatus: { kind: "error", message: "http_500" },
    });

    expect(screen.getByText("No pudimos sincronizar tu progreso.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(actions.syncNow).toHaveBeenCalled();
  });

  it("syncs on demand", async () => {
    const { actions } = await renderScreen({ session: SIGNED_IN });

    await fireEvent.press(screen.getByRole("button", { name: "Sincronizar ahora" }));

    expect(actions.syncNow).toHaveBeenCalled();
  });

  describe("signing out", () => {
    it("keeps this device's progress by default", async () => {
      const { actions } = await renderScreen({ session: SIGNED_IN });

      await fireEvent.press(screen.getByRole("button", { name: "Cerrar sesión" }));
      expect(
        screen.getByRole("radio", { name: /Conservar mi progreso/, checked: true }),
      ).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole("button", { name: "Cerrar sesión ahora" }));

      expect(actions.signOut).toHaveBeenCalledWith({ keepLocalProgress: true });
    });

    it("can delete this device's progress", async () => {
      const { actions } = await renderScreen({ session: SIGNED_IN });

      await fireEvent.press(screen.getByRole("button", { name: "Cerrar sesión" }));
      await fireEvent.press(screen.getByRole("radio", { name: /Borrarlo de este dispositivo/ }));
      await fireEvent.press(screen.getByRole("button", { name: "Cerrar sesión ahora" }));

      expect(actions.signOut).toHaveBeenCalledWith({ keepLocalProgress: false });
    });

    it("can be cancelled", async () => {
      const { actions } = await renderScreen({ session: SIGNED_IN });

      await fireEvent.press(screen.getByRole("button", { name: "Cerrar sesión" }));
      await fireEvent.press(screen.getByRole("button", { name: "Cancelar" }));

      expect(actions.signOut).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Cerrar sesión ahora" })).toBeNull();
    });
  });

  describe("deleting the account", () => {
    it("asks for confirmation, deletes and says so", async () => {
      const { actions } = await renderScreen({ session: SIGNED_IN });

      await fireEvent.press(screen.getByRole("button", { name: "Eliminar cuenta" }));
      await fireEvent.press(screen.getByRole("button", { name: "Eliminar mi cuenta" }));

      expect(actions.deleteAccount).toHaveBeenCalled();
      expect(await screen.findByText(/Eliminamos tu cuenta/)).toBeOnTheScreen();
    });

    it("leaves for Google when the sign-in is too old (deletion resumes on return)", async () => {
      const actions = fakeActions({ deleteAccount: jest.fn(async () => "redirecting" as const) });
      await renderScreen({ session: SIGNED_IN, actions });

      await fireEvent.press(screen.getByRole("button", { name: "Eliminar cuenta" }));
      await fireEvent.press(screen.getByRole("button", { name: "Eliminar mi cuenta" }));

      expect(screen.getByText(/Te pedimos que vuelvas a entrar con Google/)).toBeOnTheScreen();
    });

    it("shows an actionable error when it fails", async () => {
      const actions = fakeActions({
        deleteAccount: jest.fn(async () => {
          throw new TypeError("Failed to fetch");
        }),
      });
      await renderScreen({ session: SIGNED_IN, actions });

      await fireEvent.press(screen.getByRole("button", { name: "Eliminar cuenta" }));
      await fireEvent.press(screen.getByRole("button", { name: "Eliminar mi cuenta" }));

      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(/No pudimos eliminar tu cuenta/),
      );
    });

    it("confirms a deletion completed after signing in again", async () => {
      mockParams = { eliminada: "1" };
      await renderScreen();

      expect(screen.getByText(/Eliminamos tu cuenta/)).toBeOnTheScreen();
    });
  });
});
