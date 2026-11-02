import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode, useEffect, useState } from "react";
import { Text } from "react-native";
import type {
  DatabaseOwnership,
  OwnershipDiagnostics,
  OwnershipState,
} from "./ownership/database-ownership";
import { SqliteAppServicesProvider } from "./sqlite-app-services";

// Stand-in for expo-sqlite's SQLiteProvider with the same contract: it opens the database and
// awaits `onInit` in an effect and, on failure, calls `onError` while rendering (rethrows without
// `onError`).
const mockOpen = jest.fn<Promise<void>, []>();
jest.mock("expo-sqlite", () => ({
  SQLiteProvider: ({
    children,
    onError,
    onInit,
  }: {
    children: ReactNode;
    onError?: (error: Error) => void;
    onInit?: (db: unknown) => Promise<void>;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const react = require("react") as { useEffect: typeof useEffect; useState: typeof useState };
    const [state, setState] = react.useState<"loading" | "open" | Error>("loading");
    react.useEffect(() => {
      mockOpen()
        .then(() => onInit?.({}))
        .then(
          () => setState("open"),
          (error: Error) => setState(error),
        );
    }, []);
    if (state instanceof Error) {
      (
        onError ??
        ((e: Error) => {
          throw e;
        })
      )(state);
    }
    return state === "open" ? children : null;
  },
  useSQLiteContext: () => ({}),
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

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockOpen.mockReset();
});
afterEach(() => jest.restoreAllMocks());

describe("SqliteAppServicesProvider", () => {
  it("renders the app once the database is open", async () => {
    mockOpen.mockResolvedValue();
    await render(
      <SqliteAppServicesProvider>
        <Text>Inicio</Text>
      </SqliteAppServicesProvider>,
    );

    expect(await screen.findByText("Inicio")).toBeOnTheScreen();
  });

  it("shows a fallback instead of a blank screen when the database cannot open", async () => {
    mockOpen.mockRejectedValue(new Error("database disk image is malformed"));
    await render(
      <SqliteAppServicesProvider>
        <Text>Inicio</Text>
      </SqliteAppServicesProvider>,
    );

    expect(await screen.findByRole("header")).toHaveTextContent("No pudimos abrir tus datos.");
    expect(screen.queryByText("Inicio")).toBeNull();
  });

  it("when the files are held, explains how to free them (never claims another tab)", async () => {
    mockOpen.mockRejectedValue(new Error("The object is in an invalid state."));
    await render(
      <SqliteAppServicesProvider>
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
      <SqliteAppServicesProvider>
        <Text>Inicio</Text>
      </SqliteAppServicesProvider>,
    );
    await screen.findByRole("header");

    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Inicio")).toBeOnTheScreen();
    expect(mockOpen).toHaveBeenCalledTimes(2);
  });
});

const DIAGNOSTICS: OwnershipDiagnostics = {
  reason: "probe-free",
  startedAt: 0,
  decidedAt: 0,
  lockHolders: null,
  probeError: null,
  takeOverAttempts: 0,
  environment: { webLocks: true, broadcastChannel: true, opfs: true, displayMode: "browser" },
};
const state = (
  kind: OwnershipState["kind"],
  reason: OwnershipDiagnostics["reason"] = "probe-free",
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
    confirmOpened: jest.fn(),
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
      <SqliteAppServicesProvider ownership={ownership}>
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
      <SqliteAppServicesProvider ownership={ownership}>
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
      <SqliteAppServicesProvider ownership={ownership}>
        <Text>Inicio</Text>
      </SqliteAppServicesProvider>,
    );
    await screen.findByText("Inicio");

    await act(async () => {
      await requestRelease();
    });

    expect(screen.queryByText("Inicio")).toBeNull();
  });

  it("tells the ownership once the database really opened (probe false positives)", async () => {
    const { ownership } = fakeOwnership(state("owned", "probe-busy"));
    await render(
      <SqliteAppServicesProvider ownership={ownership}>
        <Text>Inicio</Text>
      </SqliteAppServicesProvider>,
    );
    await screen.findByText("Inicio");

    expect(ownership.confirmOpened).toHaveBeenCalledTimes(1);
  });

  it("'Usar aquí' that gets no answer shows the help screen, and 'Reintentar' waits longer", async () => {
    const { ownership } = fakeOwnership(
      state("open-elsewhere", "lock-held"),
      state("stuck", "no-owner-answer"),
      state("owned"),
    );
    await render(
      <SqliteAppServicesProvider ownership={ownership}>
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
