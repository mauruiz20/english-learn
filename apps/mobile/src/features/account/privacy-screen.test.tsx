import { render, screen } from "@testing-library/react-native";
import { PrivacyScreen } from "./privacy-screen";

describe("PrivacyScreen", () => {
  it("says that answers marked as correct are stored to improve the content", async () => {
    await render(<PrivacyScreen />);

    expect(screen.getByText(/respuestas que marques como correctas/)).toBeOnTheScreen();
    expect(screen.getByText(/mejorar los ejercicios/)).toBeOnTheScreen();
  });
});
