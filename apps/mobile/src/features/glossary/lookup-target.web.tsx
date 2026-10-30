import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { useTheme } from "@/shared/ui/use-theme";
import { useGlossary } from "./glossary-provider";
import {
  LOOKUP_HINT_A11Y,
  lookupLabel,
  underlineColor,
  type LookupTargetProps,
} from "./lookup-labels";

/** How long the pointer rests on a word before its tooltip shows (skips passing movements). */
export const HOVER_DELAY_MS = 250;

/** A mouse (or another precise pointer that can hover); touch screens only tap. */
function canHover(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(hover: hover) and (pointer: fine)").matches === true
  );
}

/**
 * Web lookup target: a plain inline `<span role="button">` inside the sentence, so the text
 * still wraps, reads and selects like the rest of the paragraph (react-native-web would render a
 * `<button>`, which neither wraps nor selects). Hover (mouse) shows a tooltip; click, Enter or
 * Space opens the card.
 */
export function LookupTarget({ text, entryId }: LookupTargetProps) {
  const { colors } = useTheme();
  const glossary = useGlossary();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const openCard = (element: HTMLElement) => glossary?.open(entryId, element, "dialog");
  const style: CSSProperties = {
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
    textDecorationColor: underlineColor(colors.textMuted),
    textDecorationThickness: "1px",
    textUnderlineOffset: "0.24em",
    cursor: "pointer",
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={lookupLabel(text)}
      aria-description={LOOKUP_HINT_A11Y}
      aria-haspopup="dialog"
      style={style}
      onClick={(event: MouseEvent<HTMLSpanElement>) => {
        event.stopPropagation();
        openCard(event.currentTarget);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLSpanElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        openCard(event.currentTarget);
      }}
      onMouseEnter={(event: MouseEvent<HTMLSpanElement>) => {
        if (!canHover()) return;
        const element = event.currentTarget;
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = setTimeout(
          () => glossary?.open(entryId, element, "tooltip"),
          HOVER_DELAY_MS,
        );
      }}
      onMouseLeave={(event: MouseEvent<HTMLSpanElement>) => {
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = null;
        glossary?.closeTooltip(event.currentTarget);
      }}
    >
      {text}
    </span>
  );
}
