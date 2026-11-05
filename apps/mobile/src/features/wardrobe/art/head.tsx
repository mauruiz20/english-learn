import { Circle, Ellipse, Path } from "react-native-svg";
import type { AviArtProps } from "@/shared/ui/mascot";
import { DETAIL, OUTLINE, PAPER_WHITE } from "./ink";

// Hats, drawn around the head anchor: the brim sits on y = 0 (Avi's top edge), the hat rises to
// y ≈ −13 (the dressed Avi has 12 units of headroom, and the anchor's tilt eats into it less at
// the back). The nose is towards +x.

/** A baseball cap: a sky crown with a seam and a button, the bill pointing at the nose. */
export function Gorra({ ink, highlighters, small }: AviArtProps) {
  return (
    <>
      <Path
        d="M3.5 -0.4 Q9 -2.6 13 0.2 Q8.5 2 3.5 1.2 Z"
        fill={highlighters.sky}
        stroke={ink}
        strokeWidth={OUTLINE}
        strokeLinejoin="round"
      />
      <Path
        d="M-7.5 0.8 C-7.8 -5.6 -3.8 -9 0 -9 C3.8 -9 6.8 -6 6.4 0.8 Z"
        fill={highlighters.sky}
        stroke={ink}
        strokeWidth={OUTLINE}
        strokeLinejoin="round"
      />
      {!small && (
        <>
          <Path d="M-0.4 -9 Q-2.4 -4 -1.6 0.6" fill="none" stroke={ink} strokeWidth={DETAIL} />
          <Path
            d="M-6 -2.6 Q0 -4.2 6.2 -2.4"
            fill="none"
            stroke={PAPER_WHITE}
            strokeWidth={DETAIL}
            strokeLinecap="round"
          />
        </>
      )}
      <Circle cx={-0.2} cy={-9.4} r={1.3} fill={highlighters.orange} stroke={ink} strokeWidth={1} />
    </>
  );
}

/** A pink wool beanie with a ribbed cuff and a yellow pompom. */
export function GorroDeLana({ ink, highlighters, small }: AviArtProps) {
  return (
    <>
      <Path
        d="M-7 -1 C-7.6 -7.6 -3.6 -10.4 0 -10.4 C3.6 -10.4 7.6 -7.6 7 -1 Z"
        fill={highlighters.pink}
        stroke={ink}
        strokeWidth={OUTLINE}
        strokeLinejoin="round"
      />
      <Path
        d="M-8 -3.4 H8 Q8.6 -1 8 1 H-8 Q-8.6 -1 -8 -3.4 Z"
        fill={highlighters.pink}
        stroke={ink}
        strokeWidth={OUTLINE}
        strokeLinejoin="round"
      />
      {!small && (
        <Path
          d="M-5.4 -3 V0.6 M-2.7 -3 V0.6 M0 -3 V0.6 M2.7 -3 V0.6 M5.4 -3 V0.6"
          stroke={ink}
          strokeWidth={DETAIL}
          strokeLinecap="round"
          opacity={0.7}
        />
      )}
      <Circle
        cx={0.4}
        cy={-11.2}
        r={2.7}
        fill={highlighters.yellow}
        stroke={ink}
        strokeWidth={OUTLINE}
      />
    </>
  );
}

/** A straw hat: a wide yellow brim and crown with a woven texture and an orange band. */
export function SombreroDePaja({ ink, highlighters, small }: AviArtProps) {
  return (
    <>
      <Path
        d="M-6 -1 C-6.2 -6.6 -4 -8 0 -8 C4 -8 6.2 -6.6 6 -1 Z"
        fill={highlighters.yellow}
        stroke={ink}
        strokeWidth={OUTLINE}
        strokeLinejoin="round"
      />
      <Path d="M-6.1 -3.6 Q0 -4.6 6.1 -3.6 L6 -1.2 Q0 -2.2 -6 -1.2 Z" fill={highlighters.orange} />
      <Ellipse
        cx={0}
        cy={-0.6}
        rx={12.5}
        ry={2.5}
        fill={highlighters.yellow}
        stroke={ink}
        strokeWidth={OUTLINE}
      />
      <Path
        d="M-6 -1.4 Q0 -2.6 6 -1.4"
        fill="none"
        stroke={ink}
        strokeWidth={OUTLINE}
        strokeLinecap="round"
      />
      {!small && (
        <Path
          d="M-10 -0.4 l1.4 1 M-6.5 0.4 l1.4 1 M-3 0.8 l1.4 1 M0.5 0.8 l1.4 1 M4 0.6 l1.4 1 M7.5 0 l1.4 1 M-3 -6.6 l1 1 M0.5 -7 l1 1 M3.6 -6.4 l1 1"
          stroke={ink}
          strokeWidth={DETAIL}
          strokeLinecap="round"
          opacity={0.55}
        />
      )}
    </>
  );
}

/** A folded yellow paper crown with three points, a jewel on each and a crease down the middle. */
export function CoronaDePapel({ ink, highlighters, small }: AviArtProps) {
  return (
    <>
      <Path
        d="M-7.4 0.8 L-7.8 -8 L-3.6 -3.8 L0 -10.4 L3.6 -3.8 L7.8 -8 L7.4 0.8 Z"
        fill={highlighters.yellow}
        stroke={ink}
        strokeWidth={OUTLINE}
        strokeLinejoin="round"
      />
      {!small && (
        <>
          <Path d="M-7.5 -1.6 H7.5" stroke={ink} strokeWidth={DETAIL} opacity={0.7} />
          <Path d="M0 -10.2 V0.6" stroke={ink} strokeWidth={DETAIL} opacity={0.35} />
        </>
      )}
      <Circle cx={-7.8} cy={-8.4} r={1.3} fill={highlighters.pink} stroke={ink} strokeWidth={1} />
      <Circle cx={0} cy={-10.8} r={1.5} fill={highlighters.sky} stroke={ink} strokeWidth={1} />
      <Circle cx={7.8} cy={-8.4} r={1.3} fill={highlighters.green} stroke={ink} strokeWidth={1} />
    </>
  );
}
