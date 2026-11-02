/**
 * The web app moved address. Progress lives on the device per origin, so the old address offers
 * to carry it to the new one (through a one-time transfer of the API) and afterwards sends the
 * learner there. Pure decisions; the gate and the screens do the browser work.
 */
export type OriginMove = {
  /** Where the app used to live (`https://english-learn-iwl.pages.dev`). */
  readonly oldOrigin: string;
  /** Where it lives now (`https://english.maumar.com.ar`). */
  readonly newOrigin: string;
};

/** The new address's page that takes a transfer in; the token travels in the fragment. */
export const IMPORT_PATH = "/importar";

/** `?transferir=1` on the old address shows the offer again after a move (expired link). */
const REPEAT_PARAM = "transferir";

export type VisitLocation = {
  readonly origin: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
};

export type Visit =
  /** Not the old address: the app as usual. */
  | { readonly kind: "app" }
  /** Nothing to carry, or carried already: go to the same page on the new address. */
  | { readonly kind: "redirect"; readonly url: string }
  /** The old address holds progress: offer to take it along. */
  | { readonly kind: "offer" };

export function decideVisit({
  move,
  location,
  migratedTo,
  hasProgress,
}: {
  move: OriginMove;
  location: VisitLocation;
  /** Where this device's progress was transferred to, if it was. */
  migratedTo: string | null;
  hasProgress: boolean;
}): Visit {
  if (location.origin !== move.oldOrigin) return { kind: "app" };
  const params = new URLSearchParams(location.search);
  const repeat = params.get(REPEAT_PARAM) === "1";
  if (hasProgress && (migratedTo === null || repeat)) return { kind: "offer" };
  params.delete(REPEAT_PARAM);
  const search = params.size > 0 ? `?${params}` : "";
  const target = migratedTo ?? move.newOrigin;
  return { kind: "redirect", url: `${target}${location.pathname}${search}${location.hash}` };
}

export function importUrl(newOrigin: string, token: string): string {
  return `${newOrigin}${IMPORT_PATH}#t=${encodeURIComponent(token)}`;
}

/** The token of `#t=<token>`, or null. */
export function readTransferToken(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("t");
  return token ? token : null;
}

export function repeatUrl(oldOrigin: string): string {
  return `${oldOrigin}/?${REPEAT_PARAM}=1`;
}
