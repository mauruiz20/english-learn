import { render, screen } from "@testing-library/react-native";
import { StyleSheet, processColor } from "react-native";
import { Rect } from "react-native-svg";
import {
  AVI_ANCHORS,
  Avi,
  AviOutfitContext,
  type AviArtProps,
  type AviOutfit,
  type AviPiece,
} from "./mascot";
import { palettes } from "./theme";

/** A piece that draws a rect saying how it was drawn (for assertions). */
function piece(id: string): AviPiece {
  return {
    id,
    Art: ({ small, ink }: AviArtProps) => (
      <Rect testID={`art-${id}`} width={small ? 1 : 2} height={1} fill={ink} />
    ),
  };
}

const FULL: AviOutfit = {
  head: piece("gorra"),
  neck: piece("panuelo"),
  eyes: piece("gafas-de-sol"),
  sticker: piece("estrella"),
  paper: { id: "papel-menta", fill: ({ highlighters }) => highlighters.green },
};

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

/** Where a group was moved: its matrix translation, and its rotation in whole degrees. */
const placement = (id: string) => {
  const [a, b, , , x, y] = byId(id).props.matrix as number[];
  return { x, y, rotate: Math.round((Math.atan2(b!, a!) * 180) / Math.PI) };
};

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
  it("is a 4:3 plane on the 64×48 grid without an outfit", async () => {
    await render(<Avi size={64} />);

    expect(StyleSheet.flatten(byId("avi").props.style)).toMatchObject({
      width: 64,
      height: 48,
    });
    expect(viewBox("avi-svg")).toEqual([0, 0, 64, 48]);
    expect(screen.queryByTestId(/^avi-item-/, HIDDEN)).toBeNull();
  });

  it("wears every slot, layered tail sticker → neck → face → glasses → hat", async () => {
    await render(<Avi size={64} outfit={FULL} />);

    const order = paintOrder().filter((id) => id.startsWith("avi-"));
    expect(order).toEqual([
      "avi-svg",
      "avi-body",
      "avi-item-papel-menta",
      "avi-item-estrella",
      "avi-fold",
      "avi-item-panuelo",
      "avi-face",
      "avi-item-gafas-de-sol",
      "avi-item-gorra",
    ]);
    expect(fillOf("avi-body")).toBe(processColor(palettes.light.highlighters.green));
  });

  it("places each piece at its slot's anchor", async () => {
    await render(<Avi size={64} outfit={FULL} />);

    for (const [slot, id] of [
      ["head", "gorra"],
      ["neck", "panuelo"],
      ["eyes", "gafas-de-sol"],
      ["sticker", "estrella"],
    ] as const) {
      expect(placement(`avi-item-${id}`)).toEqual(AVI_ANCHORS[slot]);
    }
  });

  it("keeps the plane on its spot when a hat needs headroom above it", async () => {
    await render(<Avi size={64} outfit={{ head: piece("gorra") }} style={{ top: 3 }} />);

    expect(viewBox("avi-svg")).toEqual([0, -12, 64, 60]);
    // 12 grid units more on top, taken back by a negative margin: the plane does not move.
    expect(StyleSheet.flatten(byId("avi").props.style)).toMatchObject({
      width: 64,
      height: 60,
      marginTop: -12,
      top: 3,
    });
  });

  it("only takes headroom for a hat", async () => {
    await render(<Avi size={80} outfit={{ neck: piece("panuelo") }} />);

    expect(viewBox("avi-svg")).toEqual([0, 0, 64, 48]);
    expect(StyleSheet.flatten(byId("avi").props.style)).toMatchObject({
      height: 60,
    });
    expect(StyleSheet.flatten(byId("avi").props.style).marginTop).toBeUndefined();
  });

  it("draws pieces with less detail at small sizes (the home path guide)", async () => {
    await render(<Avi size={40} outfit={{ neck: piece("panuelo") }} />);
    expect(byId("art-panuelo").props.width).toBe(1);

    await render(<Avi size={120} outfit={{ neck: piece("panuelo") }} />);
    expect(byId("art-panuelo").props.width).toBe(2);
  });

  it("wears the outfit of its context wherever it appears, unless given one", async () => {
    await render(
      <AviOutfitContext value={{ sticker: piece("rayo") }}>
        <Avi testID="dressed" />
        <Avi testID="bare" outfit={{}} />
      </AviOutfitContext>,
    );

    expect(screen.getAllByTestId("avi-item-rayo", HIDDEN)).toHaveLength(1);
    expect(byId("dressed-svg")).toBeTruthy();
    expect(byId("bare-svg")).toBeTruthy();
  });

  it("is plain white paper by default", async () => {
    await render(<Avi />);
    expect(fillOf("avi-body")).toBe(processColor("#FFFFFF"));
  });
});
