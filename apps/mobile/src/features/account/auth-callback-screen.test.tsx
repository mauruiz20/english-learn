import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccountContext, type AccountActions, type AccountContextValue } from "./account-context";
import { CallbackError } from "./application/account-controller";
import { AuthCallbackScreen } from "./auth-callback-screen";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));

function renderCallback(completeSignIn: AccountActions["completeSignIn"]) {
  const order: string[] = [];
  const actions = {
    startSignIn: jest.fn(),
    completeSignIn: jest.fn(async (hash: string) => {
      order.push(`complete:${hash}`);
      return completeSignIn(hash);
    }),
    signOut: jest.fn(),
    deleteAccount: jest.fn(),
    syncNow: jest.fn(),
  } as unknown as AccountActions;
  const value: AccountContextValue = {
    availability: "available",
    session: { status: "signed-out" },
    syncStatus: { kind: "idle" },
    progressVersion: 0,
    actions,
  };
  const clearFragment = jest.fn(() => order.push("cleared"));
  const view = render(
    <AccountContext value={value}>
      <AuthCallbackScreen
        readFragment={() => "#id_token=a.b.c&state=s1"}
        clearFragment={clearFragment}
      />
    </AccountContext>,
  );
  return { view, order, actions };
}

beforeEach(() => jest.clearAllMocks());

describe("AuthCallbackScreen", () => {
  it("removes the token from the address bar first, signs in, then goes back", async () => {
    const { view, order } = renderCallback(async () => "/placement");
    await view;

    expect(await screen.findByLabelText("Entrando con Google")).toBeOnTheScreen();
    expect(order).toEqual(["cleared", "complete:#id_token=a.b.c&state=s1"]);
    expect(mockReplace).toHaveBeenCalledWith("/placement");
  });

  it("explains a cancelled sign-in and offers a way back", async () => {
    const { view } = renderCallback(async () => {
      throw new CallbackError("cancelled");
    });
    await view;

    expect(await screen.findByText(/No se completó el ingreso con Google/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Volver a Cuenta" }));
    expect(mockReplace).toHaveBeenCalledWith("/cuenta");
  });

  it("explains a server error", async () => {
    const { view } = renderCallback(async () => {
      throw new CallbackError("api");
    });
    await view;

    expect(await screen.findByText(/No pudimos conectar con el servidor/)).toBeOnTheScreen();
  });

  it("explains a re-authentication with another Google account", async () => {
    const { view } = renderCallback(async () => {
      throw new CallbackError("wrong-account");
    });
    await view;

    expect(await screen.findByText(/otra cuenta de Google/)).toBeOnTheScreen();
  });
});
