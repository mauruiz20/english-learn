import { Circle, G, Path } from "react-native-svg";
import type { AviArtProps } from "@/shared/ui/mascot";
import { DETAIL, OUTLINE, PAPER_WHITE } from "./ink";

// Glasses, drawn around the eyes anchor along the eye line: Avi's eyes are at (±3.8, 0) here
// (radius 2.6). The arm runs back towards the tail (−x).

const ARM = "M-7.2 -0.8 L-12.4 -2.2";

/** Round ink frames over clear lenses with a glint. */
export function GafasRedondas({ ink, small }: AviArtProps) {
  return (
    <>
      <Path d={ARM} stroke={ink} strokeWidth={1.2} strokeLinecap="round" />
      <Path d="M-0.6 -0.6 Q0 -1.6 0.6 -0.6" fill="none" stroke={ink} strokeWidth={1.2} />
      <G fill={PAPER_WHITE} fillOpacity={0.3} stroke={ink} strokeWidth={1.3}>
        <Circle cx={-3.8} cy={0} r={3.4} />
        <Circle cx={3.8} cy={0} r={3.4} />
      </G>
      {!small && (
        <Path
          d="M-5.6 -1.6 q0.8 -1 2 -1.2 M2 -1.6 q0.8 -1 2 -1.2"
          fill="none"
          stroke={PAPER_WHITE}
          strokeWidth={DETAIL}
          strokeLinecap="round"
        />
      )}
    </>
  );
}

/** Dark lenses (the eyes disappear behind them) in ink frames, each with a white glint. */
export function GafasDeSol({ ink, eye, small }: AviArtProps) {
  const lens = "M-7.4 -2.6 H-0.8 V0.4 C-0.8 3 -2.4 3.8 -4 3.8 C-6.2 3.8 -7.4 2.6 -7.4 0.4 Z";
  return (
    <>
      <Path d={ARM} stroke={ink} strokeWidth={1.2} strokeLinecap="round" />
      <Path d="M-1 -2 H1" stroke={ink} strokeWidth={1.4} />
      <G fill={eye} stroke={ink} strokeWidth={1.1} strokeLinejoin="round">
        <Path d={lens} />
        <Path d={lens} transform="scale(-1 1)" />
      </G>
      {!small && (
        <Path
          d="M-6 -1.2 l1.6 0 M-6 0.4 l1 0 M2.2 -1.2 l1.6 0 M2.2 0.4 l1 0"
          stroke={PAPER_WHITE}
          strokeWidth={DETAIL}
          strokeLinecap="round"
        />
      )}
    </>
  );
}

/** Aviator glasses: sky-tinted teardrop lenses, a double bridge and a yellow (gold) frame. */
export function GafasDeAviador({ ink, highlighters, small }: AviArtProps) {
  const lens =
    "M-7.6 -2.6 Q-4.2 -3.4 -0.8 -2.4 Q-0.4 1.6 -2.4 3.4 Q-5 4.6 -6.9 2.4 Q-8 0.6 -7.6 -2.6 Z";
  return (
    <>
      <Path d={ARM} stroke={ink} strokeWidth={1.2} strokeLinecap="round" />
      <Path
        d="M-1 -2.4 Q0 -3.4 1 -2.4 M-0.8 -0.6 H0.8"
        fill="none"
        stroke={ink}
        strokeWidth={1}
        strokeLinecap="round"
      />
      <G fill={highlighters.sky} fillOpacity={0.55} strokeLinejoin="round">
        <Path d={lens} stroke={highlighters.yellow} strokeWidth={OUTLINE + 0.6} />
        <Path d={lens} transform="scale(-1 1)" stroke={highlighters.yellow} strokeWidth={2.1} />
      </G>
      <G fill="none" stroke={ink} strokeWidth={0.7}>
        <Path d={lens} />
        <Path d={lens} transform="scale(-1 1)" />
      </G>
      {!small && (
        <Path
          d="M-6.4 -1.4 q1.2 -0.8 2.6 -0.6 M1.2 -1.4 q1.2 -0.8 2.6 -0.6"
          fill="none"
          stroke={PAPER_WHITE}
          strokeWidth={DETAIL}
          strokeLinecap="round"
        />
      )}
    </>
  );
}
