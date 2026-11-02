import { render, screen } from "@testing-library/react-native";
import { AuthCallbackRelayScreen } from "./auth-callback-relay-screen";

// The relay never opens the database: rendering it without any app services or SQLite must
// work, and expo-sqlite must not even be touched.
jest.mock("expo-sqlite", () => {
  throw new Error("the callback page must not load expo-sqlite");
});

function renderRelay(handOff: (fragment: string) => Promise<"taken" | "here">) {
  const order: string[] = [];
  const continueHere = jest.fn(() => order.push("continue"));
  const closeWindow = jest.fn();
  const view = render(
    <AuthCallbackRelayScreen
      readFragment={() => "#id_token=a.b.c&state=s1"}
      clearFragment={() => order.push("cleared")}
      handOff={async (fragment) => {
        order.push(`hand-off:${fragment}`);
        return handOff(fragment);
      }}
      continueHere={continueHere}
      closeWindow={closeWindow}
    />,
  );
  return { view, order, continueHere, closeWindow };
}

describe("AuthCallbackRelayScreen (/auth/callback)", () => {
  it("clears the token from the address bar, then completes the sign-in in this tab", async () => {
    const { view, order, continueHere } = renderRelay(async () => "here");
    await view;

    expect(await screen.findByLabelText("Entrando con Google")).toBeOnTheScreen();
    await screen.findByLabelText("Entrando con Google");
    expect(order).toEqual(["cleared", "hand-off:#id_token=a.b.c&state=s1", "continue"]);
    expect(continueHere).toHaveBeenCalledTimes(1);
  });

  it("when the app window took the sign-in, says so and tries to close this view", async () => {
    const { view, continueHere, closeWindow } = renderRelay(async () => "taken");
    await view;

    expect(await screen.findByRole("header")).toHaveTextContent("Listo");
    expect(screen.getByText(/Vuelve a la app para seguir/)).toBeOnTheScreen();
    expect(continueHere).not.toHaveBeenCalled();
    expect(closeWindow).toHaveBeenCalledTimes(1);
  });
});
