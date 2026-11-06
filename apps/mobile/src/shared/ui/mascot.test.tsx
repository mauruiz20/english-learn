import { render, screen } from "@testing-library/react-native";
import { StyleSheet, processColor } from "react-native";
import { Avi } from "./mascot";

// Avi is decorative (hidden from screen readers): queries must include hidden elements.
const HIDDEN = { includeHiddenElements: true } as const;
const byId = (id: string) => screen.getByTestId(id, HIDDEN);

/** The rendered svg viewBox (react-native-svg passes it to the native view as numbers). */
const viewBox = (id: string) => {
  const { minX, minY, vbWidth, vbHeight } = byId(id).props;
  return [minX, minY, vbWidth, vbHeight];
};

/** A shape fill as react-native-svg hands it to the native view. */
const fillOf = (id: string) => (byId(id).props.fill as { payload: number }).payload;

type Node = { props: Record<string, unknown>; children: (Node | string)[] | null };

/** The test ids of the rendered tree, in render (paint) order. */
function paintOrder(): string[] {
  const ids: string[] = [];
  const walk = (node: Node | string) => {
    if (typeof node === "string") return;
    if (typeof node.props.testID === "string") ids.push(node.props.testID);
    node.children?.forEach(walk);
  };
  walk(screen.toJSON() as Node);
  return ids;
}

describe("Avi", () => {
  it("is a 4:3 plane on the 64×48 grid", async () => {
    await render(<Avi size={64} />);

    expect(StyleSheet.flatten(byId("avi").props.style)).toMatchObject({
      width: 64,
      height: 48,
    });
    expect(viewBox("avi-svg")).toEqual([0, 0, 64, 48]);
  });

  it("draws the body, then the fold line, then the face", async () => {
    await render(<Avi size={64} />);

    const order = paintOrder().filter((id) => id.startsWith("avi-") && !id.includes("-eyes-"));
    expect(order).toEqual(["avi-svg", "avi-body", "avi-fold", "avi-face"]);
  });

  it("is hidden from screen readers (decorative)", async () => {
    await render(<Avi />);

    expect(screen.queryByTestId("avi")).toBeNull();
    expect(byId("avi").props.importantForAccessibility).toBe("no-hide-descendants");
  });

  it("is plain white paper", async () => {
    await render(<Avi />);
    expect(fillOf("avi-body")).toBe(processColor("#FFFFFF"));
  });
  describe("face", () => {
    it.each([
      ["happy", "avi-eyes-open"],
      ["cheer", "avi-eyes-open"],
      ["sleepy", "avi-eyes-closed"],
      ["sad", "avi-eyes-sad"],
    ] as const)("draws %s eyes", async (mood, eyes) => {
      await render(<Avi mood={mood} />);

      expect(byId(eyes)).toBeTruthy();
    });

    it("gives the sad mood a flat mouth", async () => {
      await render(<Avi mood="sad" />);

      expect(byId("avi-mouth-flat")).toBeTruthy();
    });

    it("closes its eyes for a blink, whatever the mood", async () => {
      await render(<Avi mood="sad" blink />);

      expect(byId("avi-eyes-closed")).toBeTruthy();
      expect(screen.queryByTestId("avi-eyes-sad", HIDDEN)).toBeNull();
    });
  });
});
