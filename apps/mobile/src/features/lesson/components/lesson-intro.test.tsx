import type { LessonIntro } from "@english-learn/content";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { IntroToggle, LessonIntroScreen } from "./lesson-intro";

const intro: LessonIntro = {
  points: ["La edad va con «to be».", "Para preguntar: «How old are you?»"],
  examples: [{ en: "I'm nine years old.", es: "Tengo nueve años." }],
  mistake: {
    wrong: "I have nine years.",
    right: "I'm nine years old.",
    note: "«Tener años» no se traduce con «have».",
  },
};

describe("LessonIntroScreen", () => {
  it("shows the title, the points, the examples and the mistake, then starts", async () => {
    const onAction = jest.fn();
    await render(
      <LessonIntroScreen
        title="¿Cuántos años tienes?"
        topic={undefined}
        intro={intro}
        actionLabel="Empezar"
        onAction={onAction}
      />,
    );

    expect(screen.getByRole("header", { name: "Antes de empezar" })).toBeOnTheScreen();
    expect(screen.getByText("¿Cuántos años tienes?")).toBeOnTheScreen();
    expect(screen.getByText("La edad va con «to be».")).toBeOnTheScreen();
    expect(screen.getByText("Para preguntar: «How old are you?»")).toBeOnTheScreen();
    expect(screen.getByText("Tengo nueve años.")).toBeOnTheScreen();
    expect(screen.getByLabelText("Incorrecto: I have nine years.")).toBeOnTheScreen();
    expect(screen.getByLabelText("Correcto: I'm nine years old.")).toBeOnTheScreen();
    expect(screen.getByText("«Tener años» no se traduce con «have».")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Empezar" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("shows no mistake block when the intro has none", async () => {
    const { mistake: _mistake, ...withoutMistake } = intro;
    await render(
      <LessonIntroScreen
        title="Mi rutina"
        topic={undefined}
        intro={withoutMistake}
        actionLabel="Empezar"
        onAction={jest.fn()}
      />,
    );

    expect(screen.queryByLabelText(/^Incorrecto:/)).not.toBeOnTheScreen();
  });
});

describe("IntroToggle", () => {
  it("starts collapsed and opens the theory in place", async () => {
    await render(<IntroToggle intro={intro} />);

    const toggle = screen.getByRole("button", { name: "Repasar la teoría" });
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.queryByText("La edad va con «to be».")).not.toBeOnTheScreen();

    await fireEvent.press(toggle);

    expect(
      screen.getByRole("button", { name: "Repasar la teoría" }).props.accessibilityState,
    ).toMatchObject({ expanded: true });
    expect(screen.getByText("La edad va con «to be».")).toBeOnTheScreen();
    expect(screen.getByLabelText("Correcto: I'm nine years old.")).toBeOnTheScreen();

    await fireEvent.press(toggle);
    expect(screen.queryByText("La edad va con «to be».")).not.toBeOnTheScreen();
  });
});
