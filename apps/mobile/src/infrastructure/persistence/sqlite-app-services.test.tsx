import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode, useEffect, useState } from "react";
import { Text } from "react-native";
import type { ClaimResult, DatabaseOwnership } from "./ownership/database-ownership";
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

  it("tells the learner when another tab already has the app open", async () => {
    mockOpen.mockRejectedValue(new Error("The object is in an invalid state."));
    await render(
      <SqliteAppServicesProvider>
        <Text>Inicio</Text>
      </SqliteAppServicesProvider>,
    );

    expect(await screen.findByRole("header")).toHaveTextContent(
      "La app ya está abierta en otra pestaña.",
    );
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

function fakeOwnership(start: ClaimResult | "released", takeOver: ClaimResult = "owned") {
  let release: (() => Promise<void>) | null = null;
  const ownership: DatabaseOwnership = {
    start: jest.fn(async () => start),
    takeOver: jest.fn(async () => takeOver),
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
    const { ownership } = fakeOwnership("open-elsewhere");
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
    const { ownership } = fakeOwnership("released");
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
    const { ownership, requestRelease } = fakeOwnership("owned");
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
});
