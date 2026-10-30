/** Props of `LookupTarget` (native and web). */
export type LookupTargetProps = { text: string; entryId: string };

/** Accessible name of a lookup target: "wake up, ver traducción". */
export const lookupLabel = (text: string) => `${text}, ver traducción`;

/**
 * Color of the dotted underline: the muted ink at ~55 % opacity, so a passage where most words
 * link reads as text, not as a field of dots.
 */
export const underlineColor = (textMuted: string) => `${textMuted}8C`;

/** Accessibility hint of a lookup target. */
export const LOOKUP_HINT_A11Y = "Muestra la traducción al español";
