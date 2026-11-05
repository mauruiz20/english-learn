import { fireEvent, render, screen } from "@testing-library/react-native";
import { BackOrHomeButton, headerBack } from "./back-or-home";

const mockRouter = { canGoBack: jest.fn(), back: jest.fn(), replace: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));

beforeEach(() => {
  mockRouter.canGoBack.mockReset();
  mockRouter.back.mockReset();
  mockRouter.replace.mockReset();
});

describe("BackOrHomeButton", () => {
  it("goes home when the screen was opened without history (e.g. after the Google redirect)", async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    await render(<BackOrHomeButton />);

    await fireEvent.press(screen.getByRole("button", { name: "Volver a Inicio" }));

    expect(mockRouter.replace).toHaveBeenCalledWith("/");
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it("goes back to the previous screen when there is one", async () => {
    mockRouter.canGoBack.mockReturnValue(true);
    await render(<BackOrHomeButton />);

    await fireEvent.press(screen.getByRole("button", { name: "Volver" }));

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe("headerBack (web header)", () => {
  it("follows the stack history when there is a previous screen", () => {
    expect(headerBack("cuenta", { title: "Acerca de" })).toEqual({
      show: true,
      title: "Acerca de",
      target: "back",
    });
  });

  it.each([
    "cuenta",
    "privacidad",
    "about",
    "album",
    "armario",
    "fichas/index",
    "fichas/[id]/index",
  ])("offers a way home on /%s even without history", (route) => {
    expect(headerBack(route, undefined)).toEqual({ show: true, title: "Inicio", target: "home" });
  });

  it("hides the back button on other screens without history", () => {
    expect(headerBack("lesson/[id]", undefined)).toEqual({
      show: false,
      title: undefined,
      target: "back",
    });
  });
});
