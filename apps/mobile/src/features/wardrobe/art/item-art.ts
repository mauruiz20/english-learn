import type { Outfit } from "@english-learn/domain";
import type { ComponentType } from "react";
import type {
  AviAnchoredSlot,
  AviArtProps,
  AviOutfit,
  AviPaper,
  AviPiece,
} from "@/shared/ui/mascot";
import { GafasDeAviador, GafasDeSol, GafasRedondas } from "./eyes";
import { CoronaDePapel, Gorra, GorroDeLana, SombreroDePaja } from "./head";
import { BufandaDeRayas, Mono, Panuelo } from "./neck";
import { PAPERS } from "./paper";
import { Corazon, Estrella, Rayo } from "./sticker";

/**
 * An item's art: a piece worn at its slot's anchor, with the box (`frame`, a viewBox around the
 * anchor) its card shows it in; or a paper for Avi's body.
 */
export type ItemArt =
  | { readonly slot: AviAnchoredSlot; readonly piece: AviPiece; readonly frame: string }
  | { readonly slot: "paper"; readonly paper: AviPaper };

const FRAMES: Readonly<Record<AviAnchoredSlot, string>> = {
  head: "-14 -15 28 21",
  neck: "-17 -15 25 25",
  eyes: "-13.5 -6 22 12",
  sticker: "-6 -6 12 12",
};

function worn(
  slot: AviAnchoredSlot,
  entries: Record<string, ComponentType<AviArtProps>>,
): [string, ItemArt][] {
  return Object.entries(entries).map(([id, Art]) => [
    id,
    { slot, piece: { id, Art }, frame: FRAMES[slot] },
  ]);
}

/** The art of every item drawn so far, by item id (the badge prizes come with slice 4). */
export const ITEM_ART: Readonly<Record<string, ItemArt>> = Object.fromEntries([
  ...worn("head", {
    gorra: Gorra,
    "gorro-de-lana": GorroDeLana,
    "sombrero-de-paja": SombreroDePaja,
    "corona-de-papel": CoronaDePapel,
  }),
  ...worn("neck", { panuelo: Panuelo, mono: Mono, "bufanda-de-rayas": BufandaDeRayas }),
  ...worn("eyes", {
    "gafas-redondas": GafasRedondas,
    "gafas-de-sol": GafasDeSol,
    "gafas-de-aviador": GafasDeAviador,
  }),
  ...worn("sticker", { estrella: Estrella, corazon: Corazon, rayo: Rayo }),
  ...Object.entries(PAPERS).map(([id, paper]): [string, ItemArt] => [id, { slot: "paper", paper }]),
]);

/** Avi's layers for an outfit of item ids; an item without art (yet) is left off. */
export function outfitArt(outfit: Outfit): AviOutfit {
  const layers: {
    -readonly [K in keyof AviOutfit]: AviOutfit[K];
  } = {};
  for (const id of Object.values(outfit)) {
    const art = id === undefined ? undefined : ITEM_ART[id];
    if (art === undefined) continue;
    if (art.slot === "paper") layers.paper = art.paper;
    else layers[art.slot] = art.piece;
  }
  return layers;
}
