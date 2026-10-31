import { render, screen } from "@testing-library/react-native";
import { SessionProgress } from "./session-screens";

describe("SessionProgress", () => {
  it("says where the learner is, in words and as a progress bar", async () => {
    await render(<SessionProgress position={3} total={6} title="Mi rutina diaria" />);

    expect(screen.getByText("Ejercicio 3 de 6")).toBeOnTheScreen();
    expect(screen.getByRole("progressbar", { name: "Progreso" })).toHaveProp("accessibilityValue", {
      min: 0,
      max: 6,
      now: 2,
    });
  });

  it("draws one step per exercise, colored by how each answered one went", async () => {
    await render(
      <SessionProgress position={4} total={6} results={["correct", "wrong", "almost"]} />,
    );

    const steps = screen
      .getAllByTestId(/^step-/, { includeHiddenElements: true })
      .map((s) => s.props.testID);
    expect(steps).toEqual([
      "step-correct",
      "step-wrong",
      "step-almost",
      "step-current",
      "step-todo",
      "step-todo",
    ]);
  });

  it("counts the shown answer as done while its feedback is up", async () => {
    await render(<SessionProgress position={1} total={2} results={["correct"]} />);

    const steps = screen
      .getAllByTestId(/^step-/, { includeHiddenElements: true })
      .map((s) => s.props.testID);
    expect(steps).toEqual(["step-correct", "step-todo"]);
  });
});
