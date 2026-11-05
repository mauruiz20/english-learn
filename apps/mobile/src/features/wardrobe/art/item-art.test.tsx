import { WARDROBE_CATALOG, isShopItem } from "@english-learn/domain";
import { render, screen } from "@testing-library/react-native";
import { Avi } from "@/shared/ui/mascot";
import { ITEM_ART, outfitArt } from "./item-art";

const HIDDEN = { includeHiddenElements: true } as const;
const SHOP = WARDROBE_CATALOG.filter(isShopItem);

describe("the wardrobe's art", () => {
  it("draws every item for sale, in the item's own slot", () => {
    for (const item of SHOP) {
      expect(ITEM_ART[item.id]?.slot).toBe(item.slot);
    }
  });

  it("draws nothing the catalogue does not have", () => {
    const ids = new Set(WARDROBE_CATALOG.map((item) => item.id));
    expect(Object.keys(ITEM_ART).filter((id) => !ids.has(id))).toEqual([]);
  });

  it.each(SHOP.map((item) => [item.id, item.slot]))(
    "puts %s on Avi (%s), large and small, facing both ways",
    async (id, slot) => {
      const outfit = outfitArt({ [slot]: id });
      for (const size of [40, 160]) {
        for (const facing of ["right", "left"] as const) {
          await render(<Avi size={size} facing={facing} tilt={20} outfit={outfit} />);
          expect(screen.getByTestId(`avi-item-${id}`, HIDDEN)).toBeOnTheScreen();
        }
      }
    },
  );

  it("turns an outfit of item ids into Avi's layers, skipping ids without art", () => {
    const outfit = outfitArt({ head: "gorra", paper: "papel-cuadriculado", eyes: "birrete" });

    expect(outfit.head?.id).toBe("gorra");
    expect(outfit.paper?.id).toBe("papel-cuadriculado");
    expect(outfit.paper?.Pattern).toBeDefined();
    expect(outfit.eyes).toBeUndefined();
    expect(outfitArt({})).toEqual({});
  });
});
