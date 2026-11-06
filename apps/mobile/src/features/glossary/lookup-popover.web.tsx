import { useEffect, useRef, useState, type ComponentRef } from "react";
import { createPortal } from "react-dom";
import { View, type ViewStyle } from "react-native";
import type { HighlighterName } from "@/shared/ui/theme";
import type { OpenLookup } from "./glossary-provider";
import { LookupCard, LOOKUP_CARD_MAX_WIDTH } from "./lookup-card";
import { popoverPosition } from "./model/popover-position";

type LookupPopoverProps = {
  lookup: OpenLookup | null;
  tint?: HighlighterName | undefined;
  onClose: () => void;
};

/**
 * Web lookup card, anchored to the word: placed under it (or above when there is no room
 * below), kept inside the viewport, in a portal so no scroll container clips it. A `dialog`
 * (click / Enter) takes focus and gives it back to the word on Escape; a `tooltip` (hover) is
 * informational only. Closes on Escape, a click outside, any scroll or a resize.
 */
export function LookupPopover({ lookup, tint, onClose }: LookupPopoverProps) {
  if (lookup === null || typeof document === "undefined") return null;
  const anchor = lookup.anchor instanceof HTMLElement ? lookup.anchor : null;
  if (anchor === null) return null;
  return createPortal(
    <AnchoredCard
      key={`${lookup.entry.id}:${lookup.mode}`}
      lookup={lookup}
      anchor={anchor}
      tint={tint}
      onClose={onClose}
    />,
    document.body,
  );
}

function AnchoredCard({
  lookup,
  anchor,
  tint,
  onClose,
}: {
  lookup: OpenLookup;
  anchor: HTMLElement;
  tint: HighlighterName | undefined;
  onClose: () => void;
}) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [height, setHeight] = useState<number | null>(null);
  const dialog = lookup.mode === "dialog";

  useEffect(() => {
    const element = ref.current as unknown as HTMLElement | null;
    if (dialog) element?.focus({ preventScroll: true });
    const close = (restoreFocus: boolean) => {
      onClose();
      if (restoreFocus && dialog) anchor.focus({ preventScroll: true });
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target === null || element?.contains(target) || anchor.contains(target)) return;
      close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(true);
    };
    const onScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target !== null && element?.contains(target)) return;
      close(false);
    };
    const onResize = () => close(false);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onResize);
    };
  }, [anchor, dialog, onClose]);

  const rect = anchor.getClientRects()[0] ?? anchor.getBoundingClientRect();
  const position = popoverPosition({
    anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    height: height ?? 0,
    maxWidth: LOOKUP_CARD_MAX_WIDTH,
  });

  return (
    <View
      ref={ref}
      role={dialog ? "dialog" : "tooltip"}
      aria-label={`Traducción de ${lookup.entry.headword}`}
      tabIndex={dialog ? -1 : undefined}
      pointerEvents={dialog ? "auto" : "none"}
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      // `fixed` is web-only (react-native-web passes it through to CSS).
      style={{
        position: "fixed" as ViewStyle["position"],
        zIndex: 1000,
        top: position.top,
        left: position.left,
        width: position.width,
        // Measured first, then shown where it fits.
        opacity: height === null ? 0 : 1,
      }}
    >
      <LookupCard entry={lookup.entry} tint={tint} speakable={dialog} />
    </View>
  );
}
