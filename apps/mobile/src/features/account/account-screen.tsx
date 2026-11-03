import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { DeleteAccountDialog, SignOutDialog } from "./account-dialogs";
import { useAccount } from "./account-context";
import { AccountView, type AccountNotice } from "./account-view";

type Dialog = "none" | "sign-out" | "delete";

/** Re-renders every 30 s so "Sincronizado hace N min" stays true. */
function useNow(now: () => number): number {
  const [value, setValue] = useState(now);
  useEffect(() => {
    const timer = setInterval(() => setValue(now()), 30_000);
    return () => clearInterval(timer);
  }, [now]);
  return value;
}

/** `/cuenta`: the optional account (see `AccountProvider`). */
export function AccountScreen({ now = Date.now }: { now?: () => number }) {
  const router = useRouter();
  const { eliminada } = useLocalSearchParams<{ eliminada?: string }>();
  const { availability, session, syncStatus, actions } = useAccount();
  const [dialog, setDialog] = useState<Dialog>("none");
  const [keepLocalProgress, setKeepLocalProgress] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<AccountNotice | null>(
    eliminada === "1" ? { kind: "deleted" } : null,
  );
  const currentTime = useNow(now);

  const close = () => {
    setDialog("none");
    setKeepLocalProgress(true);
  };

  const signOut = async () => {
    if (actions === null) return;
    setBusy(true);
    try {
      await actions.signOut({ keepLocalProgress });
      setNotice(null);
      close();
    } catch (error) {
      console.error("Sign-out failed", error);
      setNotice({
        kind: "error",
        message: "No pudimos cerrar la sesión en este dispositivo. Intenta de nuevo.",
      });
      close();
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (actions === null) return;
    setBusy(true);
    try {
      const result = await actions.deleteAccount();
      setNotice(result === "deleted" ? { kind: "deleted" } : { kind: "reauthenticating" });
    } catch (error) {
      console.error("Account deletion failed", error);
      setNotice({
        kind: "error",
        message:
          "No pudimos eliminar tu cuenta. Revisa tu conexión e intenta de nuevo en unos minutos.",
      });
    } finally {
      setBusy(false);
      setDialog("none");
    }
  };

  return (
    <>
      <AccountView
        availability={availability}
        email={session.status === "signed-in" ? session.account.email : null}
        syncStatus={syncStatus}
        now={currentTime}
        notice={notice}
        onSignIn={() => actions?.startSignIn("/cuenta")}
        onSyncNow={() => void actions?.syncNow()}
        onSignOut={() => setDialog("sign-out")}
        onDeleteAccount={() => setDialog("delete")}
        onOpenPrivacy={() => router.push("/privacidad")}
      />
      {dialog === "sign-out" && (
        <SignOutDialog
          keepLocalProgress={keepLocalProgress}
          busy={busy}
          onChoose={setKeepLocalProgress}
          onConfirm={() => void signOut()}
          onCancel={close}
        />
      )}
      {dialog === "delete" && (
        <DeleteAccountDialog busy={busy} onConfirm={() => void deleteAccount()} onCancel={close} />
      )}
    </>
  );
}
