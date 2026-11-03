import { fireEvent, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { renderWithSounds } from "@/testing/render-with-sounds";
import { ExerciseLayout } from "./exercise-layout";

const onSubmit = jest.fn();
beforeEach(() => jest.clearAllMocks());

function layout(submitLabel?: string) {
  return (
    <ExerciseLayout
      instruction="Elige"
      canSubmit
      locked={false}
      onSubmit={onSubmit}
      submitLabel={submitLabel}
    >
      <Text>ejercicio</Text>
    </ExerciseLayout>
  );
}

describe("ExerciseLayout", () => {
  it("does not click on Comprobar: the verdict sound answers it", async () => {
    const sounds = createFakeSoundPlayer();
    await renderWithSounds(layout(), sounds);

    await fireEvent.press(screen.getByRole("button", { name: "Comprobar" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(sounds.played).toEqual([]);
  });

  it("clicks on another submit that gives no feedback (placement's Siguiente)", async () => {
    const sounds = createFakeSoundPlayer();
    await renderWithSounds(layout("Siguiente"), sounds);

    await fireEvent.press(screen.getByRole("button", { name: "Siguiente" }));

    expect(sounds.played).toEqual(["press"]);
  });
});
