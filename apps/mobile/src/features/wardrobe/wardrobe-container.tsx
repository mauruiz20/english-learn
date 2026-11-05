import { catalogItem, type WardrobeItem, type WardrobeSlot } from "@english-learn/domain";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { useProgressVersion } from "@/features/account/account-context";
import { useAppServices } from "@/infrastructure/services/app-services";
import { buyItem, wearItem } from "./application/wardrobe-actions";
import { purchaseDone, wardrobeFromRewards } from "./model/wardrobe";
import { useReloadOutfit } from "./wardrobe-outfit";
import { WardrobeView, type WardrobeViewState } from "./wardrobe-view";

/**
 * `/armario`: loads the learner's plumas and wardrobe every time the screen gains focus (and
 * after a sync), and writes purchases and changes of clothes as progress events, which sync like
 * any other. `?item=<id>` opens on that item, tried on.
 */
export function WardrobeContainer() {
  const { progressRepository, clock, randomBytes, deviceId, sounds } = useAppServices();
  const reloadOutfit = useReloadOutfit();
  const progressVersion = useProgressVersion();
  const params = useLocalSearchParams<{ item?: string }>();
  const [initial] = useState(() =>
    typeof params.item === "string" ? (catalogItem(params.item) ?? null) : null,
  );
  const [state, setState] = useState<WardrobeViewState>({ status: "loading" });
  const [slot, setSlot] = useState<WardrobeSlot>(initial?.slot ?? "head");
  const [trying, setTrying] = useState<WardrobeItem | null>(initial);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const read = useCallback(
    () =>
      progressRepository.getRewards().then((rewards) => {
        setState({ status: "ready", wardrobe: wardrobeFromRewards(rewards) });
      }),
    [progressRepository],
  );

  const load = useCallback(() => {
    let active = true;
    progressRepository.getRewards().then(
      (rewards) => active && setState({ status: "ready", wardrobe: wardrobeFromRewards(rewards) }),
      (error: unknown) => {
        if (!active) return;
        console.error("Failed to load the wardrobe", error);
        setState({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
    // `progressVersion` reloads the wardrobe after a sync brought another device's purchases.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressRepository, progressVersion]);

  useFocusEffect(load);

  /** Runs one write, then reads the wardrobe again and dresses every Avi in the result. */
  const write = async (run: (context: Parameters<typeof buyItem>[0]) => Promise<unknown>) => {
    if (trying === null || busy) return;
    setBusy(true);
    try {
      await run({
        repository: progressRepository,
        today: clock.today(),
        nowMs: clock.nowMs(),
        randomBytes,
        deviceId,
        item: trying,
      });
      await read();
      reloadOutfit();
    } catch (error: unknown) {
      console.error("Failed to save the wardrobe", error);
      setAnnouncement("No pudimos guardar el cambio. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <WardrobeView
      state={state}
      slot={slot}
      trying={trying}
      confirming={confirming}
      busy={busy}
      announcement={announcement}
      onSelectSlot={setSlot}
      onTry={(item) => {
        sounds.play("tap");
        setAnnouncement("");
        setTrying(item);
      }}
      onBuy={() => setConfirming(true)}
      onCancelBuy={() => setConfirming(false)}
      onConfirmBuy={() => {
        setConfirming(false);
        void write(async (context) => {
          const result = await buyItem(context);
          if (result === "bought") {
            sounds.play("achievement");
            setAnnouncement(purchaseDone(context.item));
          }
        });
      }}
      onWear={() => {
        setAnnouncement("");
        void write((context) => wearItem({ ...context, slot: context.item.slot }));
      }}
      onTakeOff={() => {
        setAnnouncement("");
        void write(async (context) => {
          await wearItem({ ...context, slot: context.item.slot, item: null });
          // Off Avi, and out of the preview too: nothing is being tried on any more.
          setTrying(null);
        });
      }}
    />
  );
}
