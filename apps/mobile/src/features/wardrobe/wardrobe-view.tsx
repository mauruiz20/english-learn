import {
  WARDROBE_CATALOG,
  type Outfit,
  type WardrobeItem,
  type WardrobeSlot,
} from "@english-learn/domain";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { FeatherSticker } from "@/features/rewards/plumas-balance";
import { balanceLabel, formatPlumas } from "@/features/rewards/model/plumas-copy";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Avi } from "@/shared/ui/mascot";
import { MOTION } from "@/shared/ui/motion";
import { PressableScale } from "@/shared/ui/pressable-scale";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { TOUCH_TARGET, radius, spacing } from "@/shared/ui/theme";
import { useReducedMotion } from "@/shared/ui/use-reduced-motion";
import { themedStyles } from "@/shared/ui/use-theme";
import { outfitArt } from "./art/item-art";
import { ItemThumbnail } from "./item-thumbnail";
import {
  SLOT_TABS,
  itemAction,
  itemLabel,
  itemState,
  itemStatusText,
  purchaseQuestion,
  trialOutfit,
  type Wardrobe,
} from "./model/wardrobe";

export type WardrobeViewState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly wardrobe: Wardrobe };

export type WardrobeViewProps = {
  state: WardrobeViewState;
  slot: WardrobeSlot;
  /** The item being tried on (or looked at), if any. */
  trying: WardrobeItem | null;
  /** The purchase dialog is open for `trying`. */
  confirming: boolean;
  /** A write is under way: the actions wait. */
  busy: boolean;
  /** Said once by screen readers (polite) and shown under Avi: "¡Listo! Avi ya tiene…". */
  announcement: string;
  onSelectSlot: (slot: WardrobeSlot) => void;
  onTry: (item: WardrobeItem) => void;
  onBuy: () => void;
  onConfirmBuy: () => void;
  onCancelBuy: () => void;
  onWear: () => void;
  onTakeOff: () => void;
};

/** Avi's size in the wardrobe's preview. */
const PREVIEW_SIZE = 168;
const THUMB_SIZE = 72;

/** The wardrobe and shop: Avi wearing what is tried on, the slots as tabs, the items as cards. */
export function WardrobeView(props: WardrobeViewProps) {
  const { state } = props;
  const styles = useStyles();
  return (
    <ScreenContainer
      title="El armario de Avi"
      footer={
        state.status === "ready" ? <ActionBar {...props} wardrobe={state.wardrobe} /> : undefined
      }
    >
      {state.status === "loading" && <ActivityIndicator accessibilityLabel="Cargando el armario" />}
      {state.status === "error" && (
        <Text accessibilityRole="alert" tone="redPen">
          No pudimos abrir el armario.
        </Text>
      )}
      {state.status === "ready" && (
        <>
          <Balance balance={state.wardrobe.balance} />
          <Stage
            outfit={trialOutfit(state.wardrobe.outfit, props.trying)}
            tryingId={props.trying?.id ?? null}
            cheer={props.announcement !== ""}
          />
          <Text
            accessibilityLiveRegion="polite"
            variant="bodyStrong"
            tone="success"
            style={styles.announcement}
          >
            {props.announcement}
          </Text>
          <SlotTabs slot={props.slot} onSelect={props.onSelectSlot} />
          <ItemGrid
            slot={props.slot}
            wardrobe={state.wardrobe}
            tryingId={props.trying?.id ?? null}
            onTry={props.onTry}
          />
          {props.trying !== null && (
            <ConfirmDialog
              visible={props.confirming}
              title="Comprar"
              message={purchaseQuestion(props.trying)}
              confirmLabel="Comprar"
              cancelLabel="Ahora no"
              onConfirm={props.onConfirmBuy}
              onCancel={props.onCancelBuy}
            />
          )}
        </>
      )}
    </ScreenContainer>
  );
}

/** "Tienes 135 plumas" with the feather sticker; a debt reads "Debes 30 plumas". */
function Balance({ balance }: { balance: number }) {
  const styles = useStyles();
  return (
    <View
      testID="armario-plumas"
      accessible
      accessibilityRole="text"
      accessibilityLabel={balanceLabel(balance)}
      style={styles.balance}
    >
      <FeatherSticker size={34} />
      <Text variant="title" tone={balance < 0 ? "redPen" : "ink"}>
        {balanceLabel(balance)}
      </Text>
    </View>
  );
}

/**
 * Avi, large, wearing the trial outfit. Trying something on gives a small hop (the item lands on
 * Avi); with reduced motion Avi simply wears it.
 */
function Stage({
  outfit,
  tryingId,
  cheer,
}: {
  outfit: Outfit;
  tryingId: string | null;
  cheer: boolean;
}) {
  const styles = useStyles();
  const reduced = useReducedMotion();
  const lift = useSharedValue(0);
  useEffect(() => {
    if (reduced || tryingId === null) {
      lift.set(0);
      return;
    }
    lift.set(
      withSequence(
        withTiming(1, { duration: MOTION.page / 2 }),
        withTiming(0, { duration: MOTION.page }),
      ),
    );
  }, [tryingId, reduced, lift]);
  const hop = useAnimatedStyle(() => ({ transform: [{ translateY: -8 * lift.value }] }));
  return (
    <View style={styles.stage}>
      <Animated.View testID="armario-stage" style={reduced ? undefined : hop}>
        <Avi
          testID="armario-avi"
          size={PREVIEW_SIZE}
          tilt={-8}
          mood={cheer ? "cheer" : "happy"}
          outfit={outfitArt(outfit)}
        />
      </Animated.View>
    </View>
  );
}

function SlotTabs({
  slot,
  onSelect,
}: {
  slot: WardrobeSlot;
  onSelect: (slot: WardrobeSlot) => void;
}) {
  const styles = useStyles();
  return (
    // One row that scrolls sideways on a narrow phone (five tabs do not fit 375 pt).
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {SLOT_TABS.map((tab) => {
          const selected = tab.slot === slot;
          return (
            <PressableScale
              key={tab.slot}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected }}
              onPress={() => onSelect(tab.slot)}
              style={[styles.tab, selected && styles.tabSelected]}
            >
              <Text variant="smallStrong" tone={selected ? "onInk" : "ink"}>
                {tab.label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </ScrollView>
  );
}

function ItemGrid({
  slot,
  wardrobe,
  tryingId,
  onTry,
}: {
  slot: WardrobeSlot;
  wardrobe: Wardrobe;
  tryingId: string | null;
  onTry: (item: WardrobeItem) => void;
}) {
  const styles = useStyles();
  // Three cards a row: their width follows the column (measured), never a percentage that wraps.
  const [width, setWidth] = useState(0);
  const cardWidth = width === 0 ? undefined : Math.floor((width - 2 * spacing.sm) / 3);
  return (
    <View style={styles.grid} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {WARDROBE_CATALOG.filter((item) => item.slot === slot).map((item) => {
        const state = itemState(item, wardrobe);
        const trying = item.id === tryingId;
        return (
          <PressableScale
            key={item.id}
            testID={`item-${item.id}`}
            accessibilityRole="button"
            accessibilityLabel={itemLabel(item, wardrobe)}
            accessibilityState={{ selected: trying }}
            pressSound={false}
            onPress={() => onTry(item)}
            wrapperStyle={[styles.cardWrapper, cardWidth !== undefined && { width: cardWidth }]}
            style={[styles.card, trying && styles.cardTrying, state === "worn" && styles.cardWorn]}
          >
            <ItemThumbnail item={item} size={THUMB_SIZE} />
            <Text variant="smallStrong" style={styles.cardName}>
              {item.name}
            </Text>
            <Text
              variant="small"
              tone={state === "worn" ? "ink" : "muted"}
              style={state === "worn" && styles.wornText}
            >
              {itemStatusText(item, state)}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** The pinned footer: the one action for the item being tried on. */
function ActionBar({
  trying,
  wardrobe,
  busy,
  onBuy,
  onWear,
  onTakeOff,
}: WardrobeViewProps & { wardrobe: Wardrobe }) {
  const styles = useStyles();
  if (trying === null) {
    return (
      <Text tone="muted" style={styles.hint}>
        Toca una prenda para probársela a Avi.
      </Text>
    );
  }
  const action = itemAction(trying, wardrobe);
  switch (action.kind) {
    case "buy":
      return (
        <Button
          label={`Comprar por ${formatPlumas(action.price)}`}
          disabled={busy}
          onPress={onBuy}
        />
      );
    case "short":
      return (
        // Not a dimmed button (its text would fail contrast): the key, drawn dashed, says why.
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Comprar por ${formatPlumas(action.missing + wardrobe.balance)}. ${action.text}`}
          accessibilityState={{ disabled: true }}
          style={styles.shortKey}
        >
          <Text variant="bodyStrong" tone="muted">
            {action.text}
          </Text>
        </View>
      );
    case "wear":
      return <Button label="Ponérselo" disabled={busy} onPress={onWear} />;
    case "take-off":
      return <Button label="Quitárselo" variant="secondary" disabled={busy} onPress={onTakeOff} />;
    case "locked":
      return (
        <Text tone="muted" style={styles.hint}>
          {action.text}
        </Text>
      );
  }
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    balance: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    stage: {
      alignItems: "center",
      justifyContent: "center",
      paddingTop: spacing.xl,
      paddingBottom: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.sheet,
      boxShadow: `0 3px 0 ${colors.rule}`,
    },
    announcement: { textAlign: "center", minHeight: 0 },
    // Bleeds to the screen edges so a cut-off tab reads as "more to the side".
    tabsScroll: { marginHorizontal: -spacing.md, flexGrow: 0 },
    tabs: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md },
    tab: {
      minHeight: TOUCH_TARGET,
      justifyContent: "center",
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: colors.ink,
      backgroundColor: colors.sheet,
    },
    tabSelected: { backgroundColor: colors.ink },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    cardWrapper: { width: 100 },
    card: {
      minHeight: 128,
      alignItems: "center",
      gap: 2,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: colors.rule,
      backgroundColor: colors.sheet,
    },
    cardTrying: { borderColor: colors.ink, boxShadow: `0 3px 0 ${colors.ink}` },
    cardWorn: { backgroundColor: colors.paper },
    cardName: { textAlign: "center" },
    wornText: { fontWeight: "700" },
    hint: { textAlign: "center", paddingVertical: spacing.sm },
    shortKey: {
      minHeight: TOUCH_TARGET,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: colors.textMuted,
    },
  }),
);
