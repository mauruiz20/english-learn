import { createContext, use, useEffect, useId, type ComponentType } from "react";
import { Platform, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, ClipPath, Defs, G, Path } from "react-native-svg";
import { MOTION } from "./motion";
import type { Palette } from "./theme";
import { useReducedMotion } from "./use-reduced-motion";
import { useTheme } from "./use-theme";

export type AviMood = "happy" | "cheer" | "sleepy";

/** What an item's art may draw with: the scheme's ink and highlighters, Avi's eye ink. */
export type AviArtProps = {
  readonly ink: string;
  readonly highlighters: Palette["highlighters"];
  /** Avi's face ink, dark in both schemes (the plane is light paper). */
  readonly eye: string;
  /** Avi is small (≤ 44 pt, e.g. the home path guide): leave out strokes thinner than 1 pt. */
  readonly small: boolean;
};

/**
 * An item worn in a slot: art drawn around (0, 0) on Avi's 64×48 grid, unrotated; Avi moves it
 * to the slot's anchor (`AVI_ANCHORS`). No letters or numbers: a mirrored Avi would read them
 * backwards.
 */
export type AviPiece = { readonly id: string; readonly Art: ComponentType<AviArtProps> };

/** Avi's paper: the body's fill, and an optional pattern drawn inside the body. */
export type AviPaper = {
  readonly id: string;
  readonly fill: (props: AviArtProps) => string;
  readonly Pattern?: ComponentType<AviArtProps>;
};

/** What Avi wears, per slot (see `docs/design/avi-rewards.md`, section 4.1). */
export type AviOutfit = {
  readonly head?: AviPiece;
  readonly neck?: AviPiece;
  readonly eyes?: AviPiece;
  readonly sticker?: AviPiece;
  readonly paper?: AviPaper;
};

/**
 * Where each slot's piece goes on the 64×48 grid, and its rotation in degrees: the hat on the top
 * edge (`M3 23 → L61 5`, ≈ −17°) above the face, the scarf across the body behind the face, the
 * glasses centred between the eyes along the eye line (≈ −23°), the sticker on the tail.
 */
export const AVI_ANCHORS = {
  head: { x: 46, y: 10, rotate: -17 },
  neck: { x: 36, y: 20, rotate: -17 },
  eyes: { x: 46.5, y: 17.5, rotate: -23 },
  sticker: { x: 20, y: 21, rotate: -17 },
} as const;

export type AviAnchoredSlot = keyof typeof AVI_ANCHORS;

/** Grid units above the plane a hat may use (the dressed viewBox starts at y = −12). */
export const AVI_HEADROOM = 12;

/**
 * The outfit every `Avi` below wears unless given its own (`outfit`): the app provides the
 * learner's (`features/wardrobe`); without a provider Avi wears nothing.
 */
export const AviOutfitContext = createContext<AviOutfit>({});

/** Avi is drawn with less detail at this width or below. */
const SMALL_SIZE = 44;

type AviProps = {
  mood?: AviMood;
  /** Width in points (the plane is 4:3). */
  size?: number;
  /** Glide in once, from the side it faces, after `delayMs` (e.g. to the lesson to do next). */
  fly?: boolean;
  /** Final rotation in degrees (positive turns the nose down). The art itself points ≈ 17° up. */
  tilt?: number;
  /** Which way the nose points; "left" mirrors the plane. */
  facing?: "right" | "left";
  delayMs?: number;
  /** What Avi wears; by default the outfit of `AviOutfitContext` (the learner's). */
  outfit?: AviOutfit;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

// A folded paper plane seen from the side: the body, the fold line down to the keel.
const BODY = "M3 23 L61 5 L41 43 L31 28 Z";
const FOLD = "M61 5 L31 28 L27 39 L31 28";

/**
 * Avi, the notebook's paper plane: the learner's companion on the home path, on the summary and
 * in empty states; never during an exercise. Original art drawn here. Decorative. It wears the
 * learner's outfit (every piece in the one `Svg`, so tilt, mirroring and the glide apply to it).
 */
export function Avi({
  mood = "happy",
  size = 64,
  fly = false,
  tilt = -14,
  facing = "right",
  delayMs = 0,
  outfit,
  style,
  testID = "avi",
}: AviProps) {
  const { colors } = useTheme();
  const worn = use(AviOutfitContext);
  const { head, neck, eyes, sticker, paper } = outfit ?? worn;
  const clipId = `avi-body-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const reduced = useReducedMotion();
  const animate = fly && !reduced;
  const t = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) {
      t.set(1);
      return;
    }
    t.set(
      withDelay(delayMs, withTiming(1, { duration: MOTION.fly, easing: Easing.out(Easing.cubic) })),
    );
  }, [animate, delayMs, t]);
  const glide = useAnimatedStyle(() => {
    const left = 1 - t.value;
    const away = facing === "left" ? 1 : -1;
    return {
      opacity: Math.min(1, t.value * 3),
      transform: [
        // Comes from behind its tail: the left when facing right, the right when mirrored.
        { translateX: away * size * 2.2 * left },
        // An arc: up, then down onto its spot.
        { translateY: -size * 0.9 * Math.sin(left * Math.PI) },
        // Mirrored before turning, so a positive tilt still points the nose down.
        ...(facing === "left" ? [{ scaleX: -1 }] : []),
        { rotate: `${tilt + 20 * left}deg` },
      ],
    };
  });
  // The plane is light paper in both schemes, so its face is always dark ink.
  const eye = "#1B2333";
  const art: AviArtProps = {
    ink: colors.ink,
    highlighters: colors.highlighters,
    eye,
    small: size <= SMALL_SIZE,
  };
  const height = (size * 3) / 4;
  // A hat rises above the plane: more room on top, taken back by a negative margin, so the plane
  // keeps its exact spot on screen.
  const headroom = head === undefined ? 0 : (size * AVI_HEADROOM) / 64;
  const Pattern = paper?.Pattern;
  return (
    <Animated.View
      testID={testID}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        { width: size, height: height + headroom },
        headroom > 0 && { marginTop: -headroom },
        style,
        glide,
      ]}
    >
      <Svg
        testID={`${testID}-svg`}
        width={size}
        height={height + headroom}
        viewBox={head === undefined ? "0 0 64 48" : `0 ${-AVI_HEADROOM} 64 ${48 + AVI_HEADROOM}`}
      >
        <Path
          testID="avi-body"
          d={BODY}
          fill={paper === undefined ? "#FFFFFF" : paper.fill(art)}
          stroke={colors.ink}
          strokeWidth={2.6}
          strokeLinejoin="round"
        />
        {paper !== undefined &&
          (Pattern === undefined ? (
            <G {...itemTestId(paper.id)} />
          ) : (
            <>
              <Defs>
                <ClipPath id={clipId}>
                  <Path d={BODY} />
                </ClipPath>
              </Defs>
              <G {...itemTestId(paper.id)} clipPath={`url(#${clipId})`}>
                <Pattern {...art} />
              </G>
            </>
          ))}
        {sticker !== undefined && <Worn slot="sticker" piece={sticker} art={art} />}
        <Path
          testID="avi-fold"
          d={FOLD}
          fill="none"
          stroke={colors.ink}
          strokeWidth={2.6}
          strokeLinejoin="round"
        />
        {neck !== undefined && <Worn slot="neck" piece={neck} art={art} />}
        <G testID="avi-face">
          <Face mood={mood} eye={eye} cheek={colors.highlighters.pink} />
        </G>
        {eyes !== undefined && <Worn slot="eyes" piece={eyes} art={art} />}
        {head !== undefined && <Worn slot="head" piece={head} art={art} />}
      </Svg>
    </Animated.View>
  );
}

/**
 * A worn piece's test id: `data-testid` on web (react-native-svg hands its props to the DOM as
 * they are, and Playwright looks for `data-testid`), `testID` elsewhere.
 */
function itemTestId(id: string): Record<string, string> {
  return Platform.OS === "web" ? { "data-testid": `avi-item-${id}` } : { testID: `avi-item-${id}` };
}

/** One worn piece, moved to its slot's anchor. */
function Worn({
  slot,
  piece,
  art,
}: {
  slot: AviAnchoredSlot;
  piece: AviPiece;
  art: AviArtProps;
}) {
  const { x, y, rotate } = AVI_ANCHORS[slot];
  const { Art } = piece;
  return (
    <G {...itemTestId(piece.id)} transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <Art {...art} />
    </G>
  );
}

/** Eyes, mouth and cheek, by mood. */
function Face({ mood, eye, cheek }: { mood: AviMood; eye: string; cheek: string }) {
  return (
    <>
      {mood === "sleepy" ? (
        <>
          <Path
            d="M40 19 q3 2 6 0"
            fill="none"
            stroke={eye}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <Path
            d="M47.5 16 q3 2 6 0"
            fill="none"
            stroke={eye}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <Circle cx={43} cy={19} r={2.6} fill={eye} />
          <Circle cx={50} cy={16} r={2.6} fill={eye} />
        </>
      )}
      {mood === "cheer" ? (
        <Path
          d="M43 23.5 q4 5 8.5 -1.5 z"
          fill={eye}
          stroke={eye}
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      ) : (
        <Path
          d="M44 24 q3 2.5 6 -1"
          fill="none"
          stroke={eye}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      )}
      <Circle cx={40} cy={25} r={2} fill={cheek} />
    </>
  );
}
