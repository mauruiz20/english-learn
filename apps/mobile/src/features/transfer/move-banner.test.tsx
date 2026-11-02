import { fireEvent, render, screen } from "@testing-library/react-native";
import { MoveBanner, type MoveBannerProps } from "./move-banner";

const handlers = { onTake: jest.fn(), onSkip: jest.fn() };

function renderBanner(status: MoveBannerProps["status"]) {
  return render(
    <MoveBanner newOrigin="https://english.maumar.com.ar" status={status} {...handlers} />,
  );
}

beforeEach(() => jest.clearAllMocks());

describe("MoveBanner", () => {
  it("says where the app moved and offers to take the progress along", async () => {
    await renderBanner({ kind: "idle" });

    expect(screen.getByText("La app se mudó a english.maumar.com.ar")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Llevar mi progreso" }));
    expect(handlers.onTake).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Ir sin mi progreso" }));
    expect(handlers.onSkip).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the transfer in progress and blocks a second press", async () => {
    await renderBanner({ kind: "sending" });

    const button = screen.getByRole("button", { name: "Llevando tu progreso…" });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(handlers.onTake).not.toHaveBeenCalled();
  });

  it.each([
    [{ reason: "offline", retryAfterSeconds: null }, /No hay conexión a internet/],
    [{ reason: "too-large", retryAfterSeconds: null }, /más de lo que podemos enviar/],
    [{ reason: "rate-limited", retryAfterSeconds: 720 }, /Espera 12 minutos/],
    [{ reason: "rate-limited", retryAfterSeconds: 30 }, /Espera 1 minuto y/],
    [{ reason: "server", retryAfterSeconds: null }, /No pudimos conectar con el servidor/],
  ] as const)("explains a failure (%o) and lets the learner retry", async (failure, message) => {
    await renderBanner({ kind: "failed", failure });

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    await fireEvent.press(screen.getByRole("button", { name: "Llevar mi progreso" }));
    expect(handlers.onTake).toHaveBeenCalledTimes(1);
  });
});
