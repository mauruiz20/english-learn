import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import type {
  DatabaseOwnership,
  OwnershipDiagnostics,
  OwnershipState,
} from "./ownership/database-ownership";
import type { OpenRetry } from "./open-retry";
import { createPageDatabase } from "./page-database";
import { SqliteAppServicesProvider, type DatabasePage } from "./sqlite-app-services";

// expo-sqlite's open: on web its first call starts the page's one SQLite worker.
const mockOpen = jest.fn<Promise<void>, []>();
jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => {
    await mockOpen();
    return {};
  },
}));
jest.mock("../sound/expo-sound-player", () => ({
  createExpoSoundPlayer: () => ({ play: () => {}, setEnabled: () => {} }),
}));
jest.mock("./init-progress-store", () => ({
  initProgressStore: async () => ({}),
}));
jest.mock("@english-learn/storage-sqlite", () => ({
  ...jest.requireActual("@english-learn/storage-sqlite"),
  createSqliteProgressRepository: () => ({ getDeviceId: async () => "device-1" }),
}));

function fakeOpenRetry(retries = false, attempts = 0): OpenRetry {
  return {
    onFailure: jest.fn(() => retries),
    onOpened: jest.fn(),
    clear: jest.fn(),
    attempts: () => attempts,
  };
}

/** A fresh page: its own one-open database, retry policy and worker count. */
function fakePage({
  retries = false,
  attempts = 0,
  workers = 1,
  reopenable = true,
}: { retries?: boolean; attempts?: number; workers?: number; reopenable?: boolean } = {}) {
  return {
    database: createPageDatabase({ reopenable }),
    openRetry: fakeOpenRetry(retries, attempts),
    workersCreated: () => workers,
  } satisfies DatabasePage;
}

let page: DatabasePage;
beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockOpen.mockReset();
  page = fakePage();
});
afterEach(() => jest.restoreAllMocks());

describe("SqliteAppServicesProvider", () => {
  it("renders the app once the database is open", async () => {
    mockOpen.mockResolvedValue();
    await render(
      <SqliteAppServicesProvider page={page}>
        <Text>Inicio</Text>
      </SqliteAppServicesProvider>,
    );

    expect(await screen.findByText("Inicio")).toBeOnTheScreen();
  });

  it("shows a fallback instead of a blank screen when the database cannot open", async () => {
    mockOpen.mockRejectedValue(new Error("database disk image is malformed"));
    await render(
      <SqliteAppServicesProvider page={page}>
        <Text>Inicio</Text>
      </SqliteAppServicesProvider>,
    );

    expect(await screen.findByRole("header")).toHaveTextContent("No pudimos abrir tus datos.");
    expect(screen.queryByText("Inicio")).toBeNull();
  });

  it("when the files are held, explains how to free them (never claims another tab)", async () => {
    mockOpen.mockRejectedValue(new Error("The object is in an invalid state."));
    await render(
      <SqliteAppServicesProvider page={page}>
        <Text>Inicio</Text>
      </SqliteAppServicesProvider>,
    );

    expect(await screen.findByRole("header")).toHaveTextContent(
      "No pudimos abrir tus datos en esta ventana.",
    );
    expect(screen.getByRole("button", { name: "Detalles técnicos" })).toBeOnTheScreen();
  });

  it("opens the database again on retry", async () => {
    mockOpen.mockRejectedValueOnce(new Error("busy")).mockResolvedValue();
    await render(
      <SqliteAppServicesProvider page={page}>
        <Text>Inicio</Text>
      </SqliteAppServicesProvider>,
    );
    await screen.findByRole("header");

    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Inicio")).toBeOnTheScreen();
    expect(mockOpen).toHaveBeenCalledTimes(2);
  });

  it("opens the database once per page, however often the app re-renders or remounts", async () => {
    mockOpen.mockResolvedValue();
    function Parent() {
      const [renders, setRenders] = useState(0);
      return (
        <>
          <Pressable accessibilityRole="button" onPress={() => setRenders((n) => n + 1)}>
            <Text>Cambiar tema</Text>
          </Pressable>
          {/* A parent that remounts the provider (a new key), e.g. a route or theme change. */}
          <SqliteAppServicesProvider key={renders} page={page}>
            <Text>Inicio {renders}</Text>
          </SqliteAppServicesProvider>
        </>
      );
    }
    await render(<Parent />);
    await screen.findByText("Inicio 0");

    await fireEvent.press(screen.getByRole("button", { name: "Cambiar tema" }));
    await fireEvent.press(screen.getByRole("button", { name: "Cambiar tema" }));

    expect(await screen.findByText("Inicio 2")).toBeOnTheScreen();
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it("web: a busy open retries (the policy reloads the page) instead of showing the error", async () => {
    page = fakePage({ retries: true, reopenable: false });
    mockOpen.mockRejectedValue(new Error("The object is in an invalid state."));
    await render(
      <SqliteAppServicesProvider page={page}>
        <Text>Inicio</Text>
      </SqliteAppServicesProvider>,
    );

    await act(async () => {});
    expect(page.openRetry.onFailure).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("header")).toBeNull();
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it("tells the retry policy once the database opened (its count starts over)", async () => {
    mockOpen.mockResolvedValue();
    await render(
      <SqliteAppServicesProvider page={page}>
        <Text>Inicio</Text>
      </SqliteAppServicesProvider>,
    );
    await screen.findByText("Inicio");

    expect(page.openRetry.onOpened).toHaveBeenCalledTimes(1);
  });

  it("'Detalles técnicos' show the page's database workers, the probe and the retries", async () => {
    page = fakePage({ attempts: 3, workers: 2 });
    mockOpen.mockRejectedValue(new Error("The object is in an invalid state."));
    await render(
      <SqliteAppServicesProvider page={page}>
        <Text>Inicio</Text>
      </SqliteAppServicesProvider>,
    );
    await screen.findByRole("header");
    await fireEvent.press(screen.getByRole("button", { name: "Detalles técnicos" }));

    expect(screen.getByText("Motivo: open-failed:InvalidStateError")).toBeOnTheScreen();
    expect(screen.getByText("Workers de la base de datos: 2")).toBeOnTheScreen();
    expect(screen.getByText("Sondeo de archivos: no")).toBeOnTheScreen();
    expect(screen.getByText("Reintentos automáticos: 3")).toBeOnTheScreen();
  });
});

const DIAGNOSTICS: OwnershipDiagnostics = {
  reason: "lock-acquired",
  startedAt: 0,
  decidedAt: 0,
  lockHolders: null,
  takeOverAttempts: 0,
  environment: { webLocks: true, broadcastChannel: true, opfs: true, displayMode: "browser" },
};
const state = (
  kind: OwnershipState["kind"],
  reason: OwnershipDiagnostics["reason"] = "lock-acquired",
): OwnershipState => ({ kind, diagnostics: { ...DIAGNOSTICS, reason } });

function fakeOwnership(
  start: OwnershipState,
  takeOver: OwnershipState = state("owned"),
  retry: OwnershipState = state("owned"),
) {
  let release: (() => Promise<void>) | null = null;
  const ownership: DatabaseOwnership = {
    start: jest.fn(async () => start),
    takeOver: jest.fn(async () => takeOver),
    retry: jest.fn(async () => retry),
    serve: jest.fn((onRelease: () => Promise<void>) => {
      release = onRelease;
      return () => {
        release = null;
      };
    }),
  };
  return { ownership, requestRelease: () => release?.() };
}

describe("SqliteAppServicesProvider: one tab at a time (web)", () => {
  beforeEach(() => mockOpen.mockResolvedValue());

  it("offers 'Usar aquí' when another tab owns the database, then opens it here", async () => {
    const { ownership } = fakeOwnership(state("open-elsewhere", "owner-answered"));
    await render(
      <SqliteAppServicesProvider ownership={ownership} page={page}>
        <Text>Inicio</Text>
      </SqliteAppServicesProvider>,
    );

    expect(await screen.findByRole("header")).toHaveTextContent(
      "La app está abierta en otra pestaña o ventana",
    );
    expect(mockOpen).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Usar aquí" }));

    expect(await screen.findByText("Inicio")).toBeOnTheScreen();
    expect(ownership.takeOver).toHaveBeenCalledTimes(1);
  });

  it("shows the released screen after handing the app to another tab, and takes it back", async () => {
    const { ownership } = fakeOwnership(state("released", "released"));
    await render(
      <SqliteAppServicesProvider ownership={ownership} page={page}>
        <Text>Inicio</Text>
      </SqliteAppServicesProvider>,
    );

    expect(await screen.findByRole("header")).toHaveTextContent("La app se abrió en otra pestaña");
    await fireEvent.press(screen.getByRole("button", { name: "Usar aquí" }));

    expect(await screen.findByText("Inicio")).toBeOnTheScreen();
  });

  it("when another tab asks for the database, closes the app here (its sync and timers stop)", async () => {
    const { ownership, requestRelease } = fakeOwnership(state("owned"));
    await render(
      <SqliteAppServicesProvider ownership={ownership} page={page}>
        <Text>Inicio</Text>
      </SqliteAppServicesProvider>,
    );
    await screen.findByText("Inicio");

    await act(async () => {
      await requestRelease();
    });

    expect(screen.queryByText("Inicio")).toBeNull();
  });

  it("'Usar aquí' that gets no answer shows the help screen, and 'Reintentar' waits longer", async () => {
    const { ownership } = fakeOwnership(
      state("open-elsewhere", "lock-held"),
      state("stuck", "no-owner-answer"),
      state("owned"),
    );
    await render(
      <SqliteAppServicesProvider ownership={ownership} page={page}>
        <Text>Inicio</Text>
      </SqliteAppServicesProvider>,
    );
    await screen.findByRole("header");
    await fireEvent.press(screen.getByRole("button", { name: "Usar aquí" }));

    expect(await screen.findByRole("header")).toHaveTextContent(
      "No pudimos abrir tus datos en esta ventana.",
    );
    expect(screen.queryByRole("button", { name: "Usar aquí" })).toBeNull();
    expect(mockOpen).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Inicio")).toBeOnTheScreen();
    expect(ownership.retry).toHaveBeenCalledTimes(1);
  });
});
