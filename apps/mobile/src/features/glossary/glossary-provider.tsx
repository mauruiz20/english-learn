import type { GlossaryEntry, GlossaryIndex } from "@english-learn/domain";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAppServices } from "@/infrastructure/services/app-services";
import type { HighlighterName } from "@/shared/ui/theme";
import { LookupPopover } from "./lookup-popover";

/**
 * How a lookup was opened. `dialog`: a tap, click or Enter (plays the tap sound, takes focus on
 * web). `tooltip`: a mouse hover on web (no sound, no focus, closes when the pointer leaves).
 */
export type LookupMode = "dialog" | "tooltip";

/** The open lookup. `anchor` is the target's DOM element on web, `null` on native. */
export type OpenLookup = {
  readonly entry: GlossaryEntry;
  readonly anchor: unknown;
  readonly mode: LookupMode;
};

type GlossaryActions = {
  readonly index: GlossaryIndex;
  readonly open: (entryId: string, anchor: unknown, mode: LookupMode) => void;
  /** Closes the open lookup if it is a tooltip on `anchor` (the pointer left it). */
  readonly closeTooltip: (anchor: unknown) => void;
};

type LookupHintState = { readonly visible: boolean; readonly dismiss: () => void };

const GlossaryContext = createContext<GlossaryActions | null>(null);
const LookupHintContext = createContext<LookupHintState | null>(null);

type GlossaryProviderProps = {
  index: GlossaryIndex;
  /** Called with the entry id every time a lookup opens (the SRS "looked up" signal). */
  onLookup?: ((entryId: string) => void) | undefined;
  /** The topic's highlighter, drawn as a thin tab on the card's left edge. */
  tint?: HighlighterName | undefined;
  children: ReactNode;
};

/**
 * Enables word lookups for its subtree (lessons and reviews; the placement test has none): the
 * glossary index for `GlossaryText`, the single open lookup card, and the first-time hint
 * (persisted through `SettingsRepository`).
 */
export function GlossaryProvider({ index, onLookup, tint, children }: GlossaryProviderProps) {
  const { settingsRepository, sounds } = useAppServices();
  const [current, setCurrent] = useState<OpenLookup | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  const hintDismissed = useRef(false);
  // The latest callbacks, so the actions given to every word stay stable.
  const latest = useRef({ onLookup, sounds, settingsRepository });
  useEffect(() => {
    latest.current = { onLookup, sounds, settingsRepository };
  });

  useEffect(() => {
    let active = true;
    settingsRepository.getLookupHintDismissed().then(
      (dismissed) => {
        if (!active || hintDismissed.current) return;
        setHintVisible(!dismissed);
      },
      (error: unknown) => console.warn("Failed to read the lookup hint setting", error),
    );
    return () => {
      active = false;
    };
  }, [settingsRepository]);

  const dismissHint = useCallback(() => {
    if (hintDismissed.current) return;
    hintDismissed.current = true;
    setHintVisible(false);
    latest.current.settingsRepository
      .setLookupHintDismissed()
      .catch((error: unknown) => console.warn("Failed to save the lookup hint setting", error));
  }, []);

  const actions = useMemo<GlossaryActions>(
    () => ({
      index,
      open: (entryId, anchor, mode) => {
        const entry = index.entriesById.get(entryId);
        if (entry === undefined) return;
        if (mode === "dialog") {
          latest.current.sounds.play("tap");
          dismissHint();
        }
        setCurrent((open) =>
          // A hover never replaces a card the learner opened on purpose.
          mode === "tooltip" && open?.mode === "dialog" ? open : { entry, anchor, mode },
        );
        latest.current.onLookup?.(entryId);
      },
      closeTooltip: (anchor) =>
        setCurrent((open) => (open?.mode === "tooltip" && open.anchor === anchor ? null : open)),
    }),
    [index, dismissHint],
  );

  const hint = useMemo(
    () => ({ visible: hintVisible, dismiss: dismissHint }),
    [hintVisible, dismissHint],
  );
  const close = useCallback(() => setCurrent(null), []);

  return (
    <GlossaryContext value={actions}>
      <LookupHintContext value={hint}>
        {children}
        <LookupPopover lookup={current} tint={tint} onClose={close} />
      </LookupHintContext>
    </GlossaryContext>
  );
}

/** The lookup actions, or `null` outside a `GlossaryProvider` (no lookups). */
export function useGlossary(): GlossaryActions | null {
  return use(GlossaryContext);
}

export function useLookupHint(): LookupHintState | null {
  return use(LookupHintContext);
}
