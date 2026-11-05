import { Path } from "react-native-svg";
import type { AviArtProps } from "@/shared/ui/mascot";
import { PAPER_WHITE } from "./ink";

// Decals on Avi's tail, about 9 units wide around the sticker anchor: each is a sticker with a
// white die-cut edge, like the app's lesson stickers.

/** A shape as a sticker: the white die-cut edge, then the colour with a thin ink line. */
function Decal({ d, fill, ink, small }: { d: string; fill: string; ink: string; small: boolean }) {
  return (
    <>
      <Path
        d={d}
        fill={PAPER_WHITE}
        stroke={PAPER_WHITE}
        strokeWidth={small ? 2.4 : 2.8}
        strokeLinejoin="round"
      />
      <Path d={d} fill={fill} stroke={ink} strokeWidth={small ? 1.1 : 0.9} strokeLinejoin="round" />
    </>
  );
}

const STAR =
  "M0 -4.3 L1.18 -1.32 L4.37 -1.12 L1.9 0.92 L2.7 4.02 L0 2.3 L-2.7 4.02 L-1.9 0.92 L-4.37 -1.12 L-1.18 -1.32 Z";
const HEART =
  "M0 3.8 C-3.8 1.2 -4.8 -1 -3.8 -2.6 C-2.8 -4.1 -0.9 -3.8 0 -2.2 C0.9 -3.8 2.8 -4.1 3.8 -2.6 C4.8 -1 3.8 1.2 0 3.8 Z";
const BOLT = "M1.4 -4.4 L-2.8 0.6 L-0.3 0.6 L-1.6 4.4 L3 -0.9 L0.4 -0.9 L1.9 -4.4 Z";

export function Estrella({ ink, highlighters, small }: AviArtProps) {
  return <Decal d={STAR} fill={highlighters.yellow} ink={ink} small={small} />;
}

export function Corazon({ ink, highlighters, small }: AviArtProps) {
  return <Decal d={HEART} fill={highlighters.pink} ink={ink} small={small} />;
}

export function Rayo({ ink, highlighters, small }: AviArtProps) {
  return <Decal d={BOLT} fill={highlighters.orange} ink={ink} small={small} />;
}
