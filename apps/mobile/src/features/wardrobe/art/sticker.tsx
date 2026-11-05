import { G, Path } from "react-native-svg";
import type { AviArtProps } from "@/shared/ui/mascot";
import { PAPER_WHITE } from "./ink";

// Decals on Avi's tail, about 9 units wide around the sticker anchor: each is a sticker with a
// white die-cut edge, like the app's lesson stickers, outlined in the face ink (the tail is light
// paper in both schemes).

/** A shape as a sticker: the white die-cut edge, then the colour with a thin ink line. */
function Decal({ d, fill, ink, small }: { d: string; fill: string; ink: string; small: boolean }) {
  return (
    <G transform="scale(1.1)">
      <Path
        d={d}
        fill={PAPER_WHITE}
        stroke={PAPER_WHITE}
        strokeWidth={small ? 2.4 : 2.8}
        strokeLinejoin="round"
      />
      <Path d={d} fill={fill} stroke={ink} strokeWidth={small ? 1.1 : 0.9} strokeLinejoin="round" />
    </G>
  );
}

const STAR =
  "M0 -4.3 L1.18 -1.32 L4.37 -1.12 L1.9 0.92 L2.7 4.02 L0 2.3 L-2.7 4.02 L-1.9 0.92 L-4.37 -1.12 L-1.18 -1.32 Z";
const HEART =
  "M0 3.8 C-3.8 1.2 -4.8 -1 -3.8 -2.6 C-2.8 -4.1 -0.9 -3.8 0 -2.2 C0.9 -3.8 2.8 -4.1 3.8 -2.6 C4.8 -1 3.8 1.2 0 3.8 Z";
const BOLT = "M1.6 -4.6 L-3.2 0.8 L-0.2 0.8 L-1.8 4.6 L3.4 -1.1 L0.4 -1.1 L2.2 -4.6 Z";

export function Estrella({ eye, highlighters, small }: AviArtProps) {
  return <Decal d={STAR} fill={highlighters.yellow} ink={eye} small={small} />;
}

export function Corazon({ eye, highlighters, small }: AviArtProps) {
  return <Decal d={HEART} fill={highlighters.pink} ink={eye} small={small} />;
}

export function Rayo({ eye, highlighters, small }: AviArtProps) {
  return <Decal d={BOLT} fill={highlighters.orange} ink={eye} small={small} />;
}
