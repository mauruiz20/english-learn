import { configure, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { withMotion } from "@/testing/motion";
import { Avi } from "./mascot";
import { ClipChainMark } from "./clip-chain";
import { Confetti } from "./confetti";
import { PopBadge } from "./pop-badge";
import { Sticker } from "./sticker";
import { XpBar } from "./xp-bar";

// These pieces are decorative (hidden from assistive technology): find them anyway.
configure({ defaultIncludeHiddenElements: true });

const hiddenProps = {
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
};

describe("XpBar", () => {
  it("shows the total XP, the sheet being filled and what is left", async () => {
    await render(<XpBar xp={1090} />);

    expect(screen.getByText("1090 XP", { exact: true })).toBeOnTheScreen();
    expect(screen.getByText("Hoja 5 de stickers")).toBeOnTheScreen();
    expect(screen.getByText("160 XP para la próxima hoja")).toBeOnTheScreen();
  });

  it("is a progress bar over the current sheet", async () => {
    await render(<XpBar xp={1090} />);

    const bar = screen.getByRole("progressbar", { name: "Hoja 5 de stickers" });
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 250, now: 90 });
  });

  it("starts empty", async () => {
    await render(<XpBar xp={0} />);

    expect(screen.getByText("0 XP", { exact: true })).toBeOnTheScreen();
    expect(screen.getByText("Hoja 1 de stickers")).toBeOnTheScreen();
  });
});

describe("ClipChainMark", () => {
  it("draws one clip per streak day, up to five", async () => {
    const { rerender } = await render(<ClipChainMark days={3} />);
    expect(screen.getAllByTestId("clip")).toHaveLength(3);

    await rerender(<ClipChainMark days={12} />);
    expect(screen.getAllByTestId("clip")).toHaveLength(5);
  });

  it("draws an empty hook without a streak, and is decorative", async () => {
    await render(<ClipChainMark days={0} />);

    expect(screen.queryAllByTestId("clip")).toHaveLength(0);
    expect(screen.getByTestId("clip-chain")).toHaveProp(
      "accessibilityElementsHidden",
      hiddenProps.accessibilityElementsHidden,
    );
  });
});

describe("Sticker", () => {
  it("is a solid, tilted sticker once won", async () => {
    await render(<Sticker testID="s" color="green" state="done" tilt={-6} />);

    const style = StyleSheet.flatten(screen.getByTestId("s").props.style);
    expect(style.borderStyle ?? "solid").toBe("solid");
    expect(style.transform).toEqual(expect.arrayContaining([{ rotate: "-6deg" }]));
  });

  it("is a dashed, empty slot while still to win", async () => {
    await render(<Sticker testID="s" color="green" state="pending" tilt={-6} />);

    const style = StyleSheet.flatten(screen.getByTestId("s").props.style);
    expect(style.borderStyle).toBe("dashed");
  });

  it("lands where it belongs at once with reduced motion", async () => {
    await render(<Sticker testID="s" color="sky" state="done" tilt={4} slap />);

    const style = StyleSheet.flatten(screen.getByTestId("s").props.style);
    expect(style.transform).toEqual(expect.arrayContaining([{ scale: 1 }, { rotate: "4deg" }]));
    expect(style.opacity ?? 1).toBe(1);
  });
});

describe("Avi, the paper plane", () => {
  it.each(["happy", "cheer", "sleepy"] as const)("is decorative when %s", async (mood) => {
    await render(<Avi mood={mood} />);

    expect(screen.getByTestId("avi")).toHaveProp("accessibilityElementsHidden", true);
  });

  function aviTransform() {
    return StyleSheet.flatten(screen.getByTestId("avi").props.style).transform as object[];
  }

  it("rests at its usual -14° and faces right by default", async () => {
    await render(<Avi fly />);

    expect(aviTransform()).toContainEqual({ rotate: "-14deg" });
    expect(aviTransform()).not.toContainEqual({ scaleX: -1 });
  });

  it("lands in its final pose at once with reduced motion: the given tilt, mirrored when facing left", async () => {
    await render(<Avi fly tilt={38} facing="left" />);

    const transform = aviTransform();
    expect(transform).toContainEqual({ rotate: "38deg" });
    expect(transform).toContainEqual({ scaleX: -1 });
    const x = transform.find((t) => "translateX" in t) as { translateX: number };
    expect(Math.abs(x.translateX)).toBe(0);
    // Mirrored before it turns, so a positive tilt still points the nose down (to the left).
    expect(transform.findIndex((t) => "scaleX" in t)).toBeLessThan(
      transform.findIndex((t) => "rotate" in t),
    );
  });

  it("glides in from the side it faces", async () => {
    withMotion();
    await render(<Avi fly delayMs={10_000} facing="left" />);
    const fromRight = aviTransform().find((t) => "translateX" in t) as { translateX: number };

    await render(<Avi fly delayMs={10_000} facing="right" />);
    const fromLeft = aviTransform().find((t) => "translateX" in t) as { translateX: number };

    expect(fromRight.translateX).toBeGreaterThan(0);
    expect(fromLeft.translateX).toBeLessThan(0);
  });
});

describe("Confetti", () => {
  it("is not shown at all with reduced motion", async () => {
    await render(<Confetti />);

    expect(screen.queryByTestId("confetti")).toBeNull();
  });

  it("falls as decorative paper dots otherwise", async () => {
    withMotion();
    await render(<Confetti />);

    const confetti = screen.getByTestId("confetti");
    expect(confetti).toHaveProp("accessibilityElementsHidden", true);
    expect(confetti).toHaveProp("pointerEvents", "none");
  });
});

describe("PopBadge", () => {
  it("shows the points as a decorative sticker", async () => {
    await render(<PopBadge label="+10" />);

    expect(screen.getByText("+10")).toBeOnTheScreen();
    expect(screen.getByTestId("pop-badge")).toHaveProp("accessibilityElementsHidden", true);
  });
});
