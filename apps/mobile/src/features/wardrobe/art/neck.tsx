import { Circle, G, Path } from "react-native-svg";
import type { AviArtProps } from "@/shared/ui/mascot";
import { DETAIL, OUTLINE, PAPER_WHITE } from "./ink";

// Neckwear, drawn around the neck anchor, behind Avi's face: a collar band runs from the top edge
// (y ≈ −7) down across the wing to the fold (y ≈ 4). Behind is −x, towards the tail: what blows
// in the wind blows that way.

/** An orange polka-dot kerchief: a collar band, its knot's ends in the wind, a flap below. */
export function Panuelo({ ink, highlighters, small }: AviArtProps) {
  return (
    <>
      <Path
        d="M-1 -7.6 Q-5 -11 -8.6 -9.4 Q-6.4 -8 -6.6 -6 Q-4 -7.4 -1 -6.6 Z"
        fill={highlighters.orange}
        stroke={ink}
        strokeWidth={OUTLINE}
        strokeLinejoin="round"
      />
      <Path
        d="M-2.6 2 L3 2 L-1.4 9.6 Z"
        fill={highlighters.orange}
        stroke={ink}
        strokeWidth={OUTLINE}
        strokeLinejoin="round"
      />
      <Path
        d="M-2.4 -7.4 L2.4 -7.4 L3 2.6 L-3 2.6 Z"
        fill={highlighters.orange}
        stroke={ink}
        strokeWidth={OUTLINE}
        strokeLinejoin="round"
      />
      <Circle
        cx={-0.4}
        cy={-7.6}
        r={1.7}
        fill={highlighters.orange}
        stroke={ink}
        strokeWidth={1.2}
      />
      {!small && (
        <G fill={PAPER_WHITE}>
          <Circle cx={0} cy={-4} r={0.8} />
          <Circle cx={-0.8} cy={-0.4} r={0.8} />
          <Circle cx={1.2} cy={1.2} r={0.7} />
          <Circle cx={-0.6} cy={4.8} r={0.8} />
          <Circle cx={-4.8} cy={-8.6} r={0.7} />
        </G>
      )}
    </>
  );
}

/** A lilac bow tie under a white paper collar. */
export function Mono({ ink, highlighters, small }: AviArtProps) {
  return (
    <>
      <Path
        d="M-1.5 -7.4 L1.5 -7.4 L1.8 2 L-1.8 2 Z"
        fill={PAPER_WHITE}
        stroke={ink}
        strokeWidth={OUTLINE}
        strokeLinejoin="round"
      />
      <Path
        d="M0 3.6 L-6 0 Q-6.8 3.6 -6 7.4 Z M0 3.6 L6 0 Q6.8 3.6 6 7.4 Z"
        fill={highlighters.lilac}
        stroke={ink}
        strokeWidth={OUTLINE}
        strokeLinejoin="round"
      />
      {!small && (
        <Path
          d="M-4.6 1.8 Q-3 3.6 -4.6 5.6 M4.6 1.8 Q3 3.6 4.6 5.6"
          fill="none"
          stroke={ink}
          strokeWidth={DETAIL}
          strokeLinecap="round"
          opacity={0.7}
        />
      )}
      <Path
        d="M-1.6 1.8 H1.6 V5.4 H-1.6 Z"
        fill={highlighters.lilac}
        stroke={ink}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </>
  );
}

/** A long green scarf with yellow stripes, wrapped once, both ends streaming back in the wind. */
export function BufandaDeRayas({ ink, highlighters, small }: AviArtProps) {
  return (
    <>
      <Path
        d="M-1 -8 C-6 -11.6 -10.6 -7.6 -16 -10 L-15.2 -6 C-10.6 -4.4 -6.4 -7.8 -1.4 -4.8 Z"
        fill={highlighters.green}
        stroke={ink}
        strokeWidth={OUTLINE}
        strokeLinejoin="round"
      />
      <Path
        d="M-1.6 -6.4 C-5 -6.2 -8.4 -2.4 -13.4 -2.6 L-12 0.8 C-7.6 1 -4.6 -2.6 -1.6 -2.6 Z"
        fill={highlighters.green}
        stroke={ink}
        strokeWidth={OUTLINE}
        strokeLinejoin="round"
      />
      <Path
        d="M-3.2 -8 L3.2 -8 L3.6 4 L-3.6 4 Z"
        fill={highlighters.green}
        stroke={ink}
        strokeWidth={OUTLINE}
        strokeLinejoin="round"
      />
      {!small && (
        <>
          <G fill={highlighters.yellow}>
            <Path d="M-3.3 -5.6 H3.3 V-4 H-3.3 Z" />
            <Path d="M-3.4 -1.6 H3.4 V0 H-3.4 Z" />
            <Path d="M-6.2 -9.6 l1.6 -0.2 l0.4 3.4 l-1.6 0.2 Z" />
            <Path d="M-10.4 -8.6 l1.6 0.2 l-0.4 3.2 l-1.6 -0.2 Z" />
            <Path d="M-6.4 -4.6 l1.6 -0.8 l0.6 3 l-1.6 0.8 Z" />
          </G>
          <Path
            d="M-15.8 -9.4 l-1.6 0.4 M-15.6 -7.8 l-1.6 0.4 M-15.4 -6.4 l-1.6 0.4 M-13 -2.2 l-1.4 0.6 M-12.6 -0.8 l-1.4 0.6"
            stroke={ink}
            strokeWidth={DETAIL}
            strokeLinecap="round"
          />
        </>
      )}
    </>
  );
}
