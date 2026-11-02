import { SchemaTooNewError } from "@english-learn/storage-sqlite";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { BACKGROUND_RETRY_INTERVAL_MS } from "@/infrastructure/persistence/background-retry";
import { DatabaseOpenError } from "@/infrastructure/persistence/database-open-error";
import { AppErrorBoundary } from "./app-error-boundary";

function Throws({ error }: { error: unknown }): never {
  throw error;
}

beforeEach(() => {
  // React and the boundary log caught errors; keep the test output clean.
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("AppErrorBoundary", () => {
  it("renders its children when nothing fails", async () => {
    await render(
      <AppErrorBoundary onRetry={jest.fn()}>
        <Text>Contenido</Text>
      </AppErrorBoundary>,
    );

    expect(screen.getByText("Contenido")).toBeOnTheScreen();
  });

  it("replaces a crashed screen with a message and a retry button", async () => {
    const onRetry = jest.fn();
    await render(
      <AppErrorBoundary onRetry={onRetry}>
        <Throws error={new Error("boom")} />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("header")).toHaveTextContent("Algo salió mal.");
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("for files held elsewhere, explains how to free them and shows technical details", async () => {
    const error = new DatabaseOpenError(
      new Error("Access Handles cannot be created if there is another open Access Handle"),
    );
    await render(
      <AppErrorBoundary onRetry={jest.fn()}>
        <Throws error={error} />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("header")).toHaveTextContent(
      "No pudimos abrir tus datos en esta ventana.",
    );
    expect(screen.getByText(/Cierra la app por completo/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Detalles técnicos" }));
    expect(screen.getByText("Motivo: open-failed:AccessHandleBusy")).toBeOnTheScreen();
  });

  it("adds the database page's own lines to the technical details", async () => {
    const error = new DatabaseOpenError(new Error("The object is in an invalid state."));
    await render(
      <AppErrorBoundary onRetry={jest.fn()} details={() => ["Workers de la base de datos: 1"]}>
        <Throws error={error} />
      </AppErrorBoundary>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Detalles técnicos" }));
    expect(screen.getByText("Motivo: open-failed:InvalidStateError")).toBeOnTheScreen();
    expect(screen.getByText("Workers de la base de datos: 1")).toBeOnTheScreen();
  });

  it("for held files, suggests restarting the iPhone if the problem persists", async () => {
    const error = new DatabaseOpenError(new Error("The object is in an invalid state."));
    await render(
      <AppErrorBoundary onRetry={jest.fn()}>
        <Throws error={error} />
      </AppErrorBoundary>,
    );

    expect(screen.getByText(/reinicia el iPhone/)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeOnTheScreen();
  });

  describe("files still busy after the wait (web)", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("keeps trying on its own and says so, so the app opens without the learner", async () => {
      const retryInBackground = jest.fn();
      const error = new DatabaseOpenError(new Error("The object is in an invalid state."));
      await render(
        <AppErrorBoundary onRetry={jest.fn()} backgroundRetry={() => retryInBackground}>
          <Throws error={error} />
        </AppErrorBoundary>,
      );

      expect(screen.getByText(/se abrirá sola/)).toBeOnTheScreen();
      expect(retryInBackground).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(BACKGROUND_RETRY_INTERVAL_MS);
      });
      expect(retryInBackground).toHaveBeenCalledTimes(1);
    });

    it("does not promise to open on its own when it will not retry", async () => {
      const error = new DatabaseOpenError(new Error("The object is in an invalid state."));
      await render(
        <AppErrorBoundary onRetry={jest.fn()} backgroundRetry={() => undefined}>
          <Throws error={error} />
        </AppErrorBoundary>,
      );

      expect(screen.queryByText(/se abrirá sola/)).toBeNull();
    });
  });

  it("explains a database saved by a newer app version", async () => {
    await render(
      <AppErrorBoundary onRetry={jest.fn()}>
        <Throws error={new DatabaseOpenError(new SchemaTooNewError(2, 1))} />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("header")).toHaveTextContent(
      "Tus datos se guardaron con una versión más nueva de la app.",
    );
  });

  it("explains any other database failure", async () => {
    await render(
      <AppErrorBoundary onRetry={jest.fn()}>
        <Throws error={new DatabaseOpenError(new Error("database disk image is malformed"))} />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("header")).toHaveTextContent("No pudimos abrir tus datos.");
  });
});
