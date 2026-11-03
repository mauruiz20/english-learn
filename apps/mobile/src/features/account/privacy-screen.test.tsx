import { render, screen } from "@testing-library/react-native";
import { PRIVACY_LAST_UPDATED, PrivacyScreen } from "./privacy-screen";

describe("PrivacyScreen", () => {
  it("says that answers marked as correct are stored to improve the content", async () => {
    await render(<PrivacyScreen />);

    expect(screen.getByText(/respuestas que marques como correctas/)).toBeOnTheScreen();
    expect(screen.getByText(/mejorar los ejercicios/)).toBeOnTheScreen();
  });

  it("says the first name stays on this device only, for the greeting, and is erased on sign-out", async () => {
    await render(<PrivacyScreen />);

    expect(
      screen.getByText("No guardamos en el servidor tu contraseña de Google ni tu nombre o foto."),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Tu nombre de pila (el de tu cuenta de Google) queda solo en este dispositivo, para saludarte en el inicio, y se borra al cerrar sesión.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText(`Última actualización: ${PRIVACY_LAST_UPDATED}`)).toBeOnTheScreen();
    expect(PRIVACY_LAST_UPDATED).toBe("3 de noviembre de 2026");
  });
});
