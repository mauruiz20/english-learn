import { Circle, G, Path } from "react-native-svg";
import type { AviArtProps } from "@/shared/ui/mascot";
import { DETAIL, OUTLINE, PAPER_WHITE } from "./ink";

// Neckwear, drawn around the neck anchor, behind Avi's face: a collar band runs from the top edge
// (y ≈ −7) down across the wing to the fold (y ≈ 4). Behind is −x, towards the tail: what blows
// in the wind blows that way. Outlined in the face ink: neckwear lies on Avi's light paper.

/** An orange polka-dot kerchief: a collar band, its knot's ends in the wind, a flap below. */
export function Panuelo({ eye: ink, highlighters, small }: AviArtProps) {
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

/** A lilac bow tie on a lilac ribbon around the neck. */
export function Mono({ eye: ink, highlighters, small }: AviArtProps) {
  return (
    <>
      <Path
        d="M-1.3 -7.4 L1.3 -7.4 L1.6 2 L-1.6 2 Z"
        fill={highlighters.lilac}
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

/**
 * A long green scarf with yellow stripes, wrapped around the top edge (Avi's neck, local y ≈ −7):
 * a collar over the edge, one end hanging down the wing to the fold and one trailing back along
 * the edge, close to the paper, so the scarf reads as worn rather than floating beside it.
 */
export function BufandaDeRayas({ eye: ink, highlighters, small }: AviArtProps) {
  const piece = {
    fill: highlighters.green,
    stroke: ink,
    strokeWidth: OUTLINE,
    strokeLinejoin: "round",
  } as const;
  return (
    <>
      {/* The end trailing back along the edge. */}
      <Path
        d="M-3.4 -9.8 C-7.4 -11 -10.4 -9.2 -14.6 -10.4 L-13.8 -7 C-10.2 -6.2 -7 -7.4 -3.6 -6.2 Z"
        {...piece}
      />
      {/* The end hanging down the wing. */}
      <Path d="M-3 -7 L1.8 -7 L2.8 4.4 L-2 4.4 Z" {...piece} />
      {/* The collar, wrapped over the edge. */}
      <Path d="M-4.4 -10.4 Q0 -11.8 4.4 -10.2 L4.6 -6.4 Q0 -7.8 -4.6 -6.4 Z" {...piece} />
      {!small && (
        <>
          <G fill={highlighters.yellow}>
            <Path d="M-2.6 -3.4 H2.1 L2.2 -1.8 H-2.6 Z" />
            <Path d="M-2.3 0.4 H2.4 L2.5 2 H-2.2 Z" />
            <Path d="M-7.6 -10.4 l1.6 -0.2 l0.3 3.6 l-1.6 0.2 Z" />
            <Path d="M-11.6 -10 l1.6 0 l0.1 3.4 l-1.6 0 Z" />
          </G>
          <Path
            d="M-1.4 4.6 l-0.2 1.4 M0.4 4.6 l0 1.4 M2.2 4.6 l0.2 1.4 M-14.6 -9.6 l-1.4 0.2 M-14.4 -8.2 l-1.4 0.2"
            stroke={ink}
            strokeWidth={DETAIL}
            strokeLinecap="round"
          />
        </>
      )}
    </>
  );
}
