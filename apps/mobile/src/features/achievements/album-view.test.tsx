import { fireEvent, render, screen } from "@testing-library/react-native";
import { AlbumView } from "./album-view";
import { ACHIEVEMENTS, type Achievement } from "./model/achievements";

describe("AlbumView", () => {
  it("shows a loading indicator", async () => {
    await render(
      <AlbumView state={{ status: "loading" }} achievements={ACHIEVEMENTS} onGoHome={jest.fn()} />,
    );

    expect(screen.getByLabelText("Cargando tu álbum")).toBeOnTheScreen();
  });

  it("says when the album could not be loaded", async () => {
    await render(
      <AlbumView state={{ status: "error" }} achievements={ACHIEVEMENTS} onGoHome={jest.fn()} />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar tu álbum.");
  });

  it("counts the stickers won out of the whole album", async () => {
    await render(
      <AlbumView
        state={{ status: "ready", unlocked: ["first-lesson", "xp-100"] }}
        achievements={ACHIEVEMENTS}
        onGoHome={jest.fn()}
      />,
    );

    expect(screen.getByRole("header", { name: "Tu álbum" })).toBeOnTheScreen();
    expect(screen.getByText(`2 de ${ACHIEVEMENTS.length} insignias`)).toBeOnTheScreen();
  });

  it("names every sticker, won or still to win, with how to win it", async () => {
    await render(
      <AlbumView
        state={{ status: "ready", unlocked: ["first-lesson"] }}
        achievements={ACHIEVEMENTS}
        onGoHome={jest.fn()}
      />,
    );

    expect(screen.getByLabelText("Primer sticker, conseguida")).toBeOnTheScreen();
    expect(
      screen.getByLabelText("Cinco stickers, por conseguir. Completa 5 lecciones."),
    ).toBeOnTheScreen();
    expect(screen.getAllByLabelText(/, (conseguida|por conseguir)/)).toHaveLength(
      ACHIEVEMENTS.length,
    );
  });

  it("shows only the stickers it is given, and counts out of them", async () => {
    const shown: readonly Achievement[] = ACHIEVEMENTS.filter((a) => a.id !== "level-c1");
    await render(
      <AlbumView
        state={{ status: "ready", unlocked: ["first-lesson"] }}
        achievements={shown}
        onGoHome={jest.fn()}
      />,
    );

    expect(screen.getByText(`1 de ${shown.length} insignias`)).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Nivel C1 completo/)).toBeNull();
    expect(
      screen.getByLabelText(
        "Nivel A1 completo, por conseguir. Completa todas las lecciones de A1.",
      ),
    ).toBeOnTheScreen();
  });

  it("goes back home", async () => {
    const onGoHome = jest.fn();
    await render(
      <AlbumView
        state={{ status: "ready", unlocked: [] }}
        achievements={ACHIEVEMENTS}
        onGoHome={onGoHome}
      />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Seguir aprendiendo" }));
    expect(onGoHome).toHaveBeenCalledTimes(1);
  });
});
