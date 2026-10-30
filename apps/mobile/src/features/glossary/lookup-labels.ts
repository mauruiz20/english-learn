/** Props of `LookupTarget` (native and web). */
export type LookupTargetProps = { text: string; entryId: string };

/** Accessible name of a lookup target: "wake up, ver traducción". */
export const lookupLabel = (text: string) => `${text}, ver traducción`;

/** Accessibility hint of a lookup target. */
export const LOOKUP_HINT_A11Y = "Muestra la traducción al español";
