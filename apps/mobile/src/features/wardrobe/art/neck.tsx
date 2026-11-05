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
 * A long green scarf with yellow stripes, wrapped once, both ends streaming back in the wind above
 * the plane (clear of the tail sticker).
 */
export function BufandaDeRayas({ eye: ink, highlighters, small }: AviArtProps) {
  return (
    <>
      <Path
        d="M-1 -9 C-5 -13 -9.5 -10.4 -14.5 -13.6 L-14 -10.2 C-9.6 -8 -5.6 -10 -1.4 -7.4 Z"
        fill={highlighters.green}
        stroke={ink}
        strokeWidth={OUTLINE}
        strokeLinejoin="round"
      />
      <Path
        d="M-1.4 -7.8 C-3.8 -8.8 -5.8 -8 -8.2 -9.6 L-8 -7.6 C-5.8 -6.6 -3.8 -7 -1.4 -6.2 Z"
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
            <Path d="M-6.6 -12 l1.6 0 l0 3.2 l-1.6 0 Z" />
            <Path d="M-10.8 -11.8 l1.6 0.1 l-0.1 3.1 l-1.6 -0.1 Z" />
            <Path d="M-5.2 -8.6 l1.4 -0.2 l0.2 1.8 l-1.4 0.2 Z" />
          </G>
          <Path
            d="M-14.6 -13.2 l-1.6 -0.3 M-14.4 -11.8 l-1.6 -0.3 M-14.2 -10.5 l-1.6 -0.3"
            stroke={ink}
            strokeWidth={DETAIL}
            strokeLinecap="round"
          />
        </>
      )}
    </>
  );
}
