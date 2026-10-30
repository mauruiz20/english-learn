import { usePreventRemove } from "expo-router";
import { useState } from "react";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";

/**
 * Asks before leaving the screen while `active` (e.g. answers given in an unfinished session).
 * Covers every way out the navigator knows of: header back, swipe gesture, Android back and,
 * on web, the browser back button (expo-router restores the URL when removal is prevented).
 * Render `dialog` in the screen.
 */
export function useLeaveConfirmation(active: boolean, title: string) {
  // Set once the learner confirmed: prevention must be off before the blocked action repeats.
  const [leaving, setLeaving] = useState(false);
  const [blocked, setBlocked] = useState<{ repeat: () => void } | null>(null);

  usePreventRemove(active && !leaving, ({ repeat }) => setBlocked({ repeat }));

  const stay = () => setBlocked(null);
  const leave = () => {
    const repeat = blocked?.repeat;
    setBlocked(null);
    setLeaving(true);
    repeat?.();
  };

  const dialog = (
    <ConfirmDialog
      visible={blocked !== null}
      title={title}
      message="Perderás las respuestas de esta sesión."
      cancelLabel="Seguir aquí"
      confirmLabel="Salir"
      onCancel={stay}
      onConfirm={leave}
    />
  );
  return { dialog };
}
