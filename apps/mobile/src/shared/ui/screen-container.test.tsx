import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { ScreenContainer } from "./screen-container";
import { Text } from "./text";
import { palettes } from "./theme";

describe("ScreenContainer footer", () => {
  it("sits on the page's paper by default", async () => {
    await render(<ScreenContainer footer={<Text>Pie</Text>} />);

    const style = StyleSheet.flatten(screen.getByTestId("screen-footer").props.style);
    expect(style.backgroundColor).toBe(palettes.light.paper);
  });

  it.each(["correct", "almost", "wrong"] as const)(
    "is tinted as a %s feedback band",
    async (tone) => {
      await render(<ScreenContainer footer={<Text>Pie</Text>} footerTone={tone} />);

      const style = StyleSheet.flatten(screen.getByTestId("screen-footer").props.style);
      expect(style.backgroundColor).toBe(palettes.light.feedback[tone].tint);
      expect(style.borderTopColor).toBe(palettes.light.feedback[tone].ink);
    },
  );
});
