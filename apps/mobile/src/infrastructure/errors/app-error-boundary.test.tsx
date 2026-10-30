import { SchemaTooNewError } from "@english-learn/storage-sqlite";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
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

  it("explains that the app is already open in another tab", async () => {
    const error = new DatabaseOpenError(
      new Error("Access Handles cannot be created if there is another open Access Handle"),
    );
    await render(
      <AppErrorBoundary onRetry={jest.fn()}>
        <Throws error={error} />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("header")).toHaveTextContent("La app ya está abierta en otra pestaña.");
    expect(screen.getByText("Ciérrala y pulsa Reintentar.")).toBeOnTheScreen();
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
