import { fireEvent, render, screen } from "@testing-library/react-native";
import { AlbumView } from "./album-view";
import { ACHIEVEMENTS } from "./model/achievements";

describe("AlbumView", () => {
  it("shows a loading indicator", async () => {
    await render(<AlbumView state={{ status: "loading" }} onGoHome={jest.fn()} />);

    expect(screen.getByLabelText("Cargando tu álbum")).toBeOnTheScreen();
  });

  it("says when the album could not be loaded", async () => {
    await render(<AlbumView state={{ status: "error" }} onGoHome={jest.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar tu álbum.");
  });

  it("counts the stickers won out of the whole album", async () => {
    await render(
      <AlbumView
        state={{ status: "ready", unlocked: ["first-lesson", "xp-100"] }}
        onGoHome={jest.fn()}
      />,
    );

    expect(screen.getByRole("header", { name: "Tu álbum" })).toBeOnTheScreen();
    expect(screen.getByText(`2 de ${ACHIEVEMENTS.length} insignias`)).toBeOnTheScreen();
  });

  it("names every sticker, won or still to win, with how to win it", async () => {
    await render(
      <AlbumView state={{ status: "ready", unlocked: ["first-lesson"] }} onGoHome={jest.fn()} />,
    );

    expect(screen.getByLabelText("Primer sticker, conseguida")).toBeOnTheScreen();
    expect(
      screen.getByLabelText("Cinco stickers, por conseguir. Completa 5 lecciones."),
    ).toBeOnTheScreen();
    expect(screen.getAllByLabelText(/, (conseguida|por conseguir)/)).toHaveLength(
      ACHIEVEMENTS.length,
    );
  });

  it("goes back home", async () => {
    const onGoHome = jest.fn();
    await render(<AlbumView state={{ status: "ready", unlocked: [] }} onGoHome={onGoHome} />);

    await fireEvent.press(screen.getByRole("button", { name: "Seguir aprendiendo" }));
    expect(onGoHome).toHaveBeenCalledTimes(1);
  });
});
