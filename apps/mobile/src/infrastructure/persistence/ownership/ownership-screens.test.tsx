import { fireEvent, render, screen } from "@testing-library/react-native";
import type { OwnershipDiagnostics } from "./database-ownership";
import {
  DatabaseStuckScreen,
  OpenElsewhereScreen,
  ReleasedScreen,
  TechnicalDetails,
  diagnosticsLines,
} from "./ownership-screens";

const DIAGNOSTICS: OwnershipDiagnostics = {
  reason: "no-owner-answer",
  startedAt: Date.parse("2026-11-02T10:00:00.000Z"),
  decidedAt: Date.parse("2026-11-02T10:00:09.500Z"),
  lockHolders: 1,
  probeError: null,
  takeOverAttempts: 1,
  environment: { webLocks: true, broadcastChannel: true, opfs: true, displayMode: "standalone" },
};

describe("tab ownership screens", () => {
  it("explains the app is open in another tab or window and offers to use it here", async () => {
    const onUseHere = jest.fn();
    await render(<OpenElsewhereScreen onUseHere={onUseHere} diagnostics={DIAGNOSTICS} />);

    expect(screen.getByRole("header")).toHaveTextContent(
      "La app está abierta en otra pestaña o ventana",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Usar aquí" }));
    expect(onUseHere).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Detalles técnicos" })).toBeOnTheScreen();
  });

  it("tells the released tab the app moved, and lets it take the app back", async () => {
    const onUseHere = jest.fn();
    await render(<ReleasedScreen onUseHere={onUseHere} />);

    expect(screen.getByRole("header")).toHaveTextContent("La app se abrió en otra pestaña");
    await fireEvent.press(screen.getByRole("button", { name: "Usar aquí" }));
    expect(onUseHere).toHaveBeenCalledTimes(1);
  });

  it("when nothing answers, explains how to free the data instead of offering 'Usar aquí'", async () => {
    const onRetry = jest.fn();
    await render(<DatabaseStuckScreen onRetry={onRetry} diagnostics={DIAGNOSTICS} />);

    expect(screen.getByRole("header")).toHaveTextContent(
      "No pudimos abrir tus datos en esta ventana.",
    );
    expect(
      screen.getByText(/Cierra la app por completo desde el selector de apps/),
    ).toBeOnTheScreen();
    expect(screen.getByText(/pestañas de english\.maumar\.com\.ar en Safari/)).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Usar aquí" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("technical details", () => {
  it("are collapsed until asked for, then show the reason code and the environment", async () => {
    await render(<TechnicalDetails lines={diagnosticsLines(DIAGNOSTICS)} />);

    const toggle = screen.getByRole("button", { name: "Detalles técnicos" });
    expect(toggle).toBeCollapsed();
    expect(screen.queryByText(/no-owner-answer/)).toBeNull();

    await fireEvent.press(toggle);

    expect(toggle).toBeExpanded();
    expect(screen.getByText("Motivo: no-owner-answer")).toBeOnTheScreen();
    expect(screen.getByText("Web Locks: sí · BroadcastChannel: sí · OPFS: sí")).toBeOnTheScreen();
    expect(screen.getByText("Modo: standalone")).toBeOnTheScreen();
  });

  it("list the codes and timestamps, nothing personal", () => {
    expect(diagnosticsLines({ ...DIAGNOSTICS, probeError: "InvalidStateError" })).toEqual([
      "Motivo: no-owner-answer",
      "Web Locks: sí · BroadcastChannel: sí · OPFS: sí",
      "Modo: standalone",
      "Bloqueos activos: 1",
      "Error de la prueba: InvalidStateError",
      "Intentos: 1",
      "Inicio: 2026-11-02T10:00:00.000Z",
      "Decisión: 2026-11-02T10:00:09.500Z",
    ]);
  });
});
