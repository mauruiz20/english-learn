import type { WardrobeItem } from "@english-learn/domain";
import Svg, { Path, Rect } from "react-native-svg";
import { Avi } from "@/shared/ui/mascot";
import { useTheme } from "@/shared/ui/use-theme";
import { ITEM_ART } from "./art/item-art";

/** Avi's dark face ink: item art is drawn for light paper. */
const EYE = "#1B2333";

/**
 * An item on its card (decorative): the piece alone, zoomed into its box; a paper as a small Avi
 * folded from it; a badge prize not drawn yet as a padlock.
 */
export function ItemThumbnail({ item, size }: { item: WardrobeItem; size: number }) {
  const { colors } = useTheme();
  const art = ITEM_ART[item.id];
  if (art === undefined) {
    return (
      <Svg width={size} height={(size * 3) / 4} viewBox="0 0 32 24" aria-hidden>
        <Path
          d="M12 11 v-3 a4 4 0 0 1 8 0 v3"
          fill="none"
          stroke={colors.textMuted}
          strokeWidth={2}
        />
        <Rect
          x={10}
          y={11}
          width={12}
          height={9}
          rx={2}
          fill={colors.sheet}
          stroke={colors.textMuted}
          strokeWidth={2}
        />
      </Svg>
    );
  }
  if (art.slot === "paper") {
    return <Avi size={size} tilt={0} outfit={{ paper: art.paper }} testID={`thumb-${item.id}`} />;
  }
  const { Art } = art.piece;
  return (
    <Svg width={size} height={(size * 3) / 4} viewBox={art.frame} aria-hidden>
      <Art ink={colors.ink} highlighters={colors.highlighters} eye={EYE} small={false} />
    </Svg>
  );
}
