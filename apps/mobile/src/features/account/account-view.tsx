import { ActivityIndicator, StyleSheet, View } from "react-native";
import type { AccountAvailability } from "@/infrastructure/auth/account-config";
import type { SyncStatus } from "@/infrastructure/sync/sync-coordinator";
import { Button } from "@/shared/ui/button";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { TOUCH_TARGET, spacing } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { syncStatusText } from "./model/sync-status-text";

export type AccountNotice =
  | { readonly kind: "deleted" }
  | { readonly kind: "reauthenticating" }
  | { readonly kind: "error"; readonly message: string };

type AccountViewProps = {
  availability: AccountAvailability;
  /** Null when signed out. */
  email: string | null;
  syncStatus: SyncStatus;
  now: number;
  notice: AccountNotice | null;
  onSignIn: () => void;
  onSyncNow: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
  onOpenPrivacy: () => void;
};

const TITLE = "Cuenta";

function PrivacyLink({ onPress }: { onPress: () => void }) {
  const styles = useStyles();
  return (
    <Text
      accessibilityRole="link"
      accessibilityLabel="Política de privacidad"
      tone="ink"
      style={styles.link}
      onPress={onPress}
    >
      Política de privacidad
    </Text>
  );
}

function Notice({ notice }: { notice: AccountNotice }) {
  switch (notice.kind) {
    case "deleted":
      return (
        <Text accessibilityRole="alert" variant="bodyStrong">
          Eliminamos tu cuenta y el progreso guardado en ella. Tu progreso sigue en este
          dispositivo.
        </Text>
      );
    case "reauthenticating":
      return (
        <Text accessibilityRole="alert">
          Te pedimos que vuelvas a entrar con Google para confirmar que eres tú; después eliminamos
          la cuenta.
        </Text>
      );
    case "error":
      return (
        <Text accessibilityRole="alert" tone="redPen">
          {notice.message}
        </Text>
      );
  }
}

function SignedIn({
  email,
  syncStatus,
  now,
  onSyncNow,
  onSignOut,
  onDeleteAccount,
}: Pick<AccountViewProps, "syncStatus" | "now" | "onSyncNow" | "onSignOut" | "onDeleteAccount"> & {
  email: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const syncing = syncStatus.kind === "syncing";
  return (
    <>
      <View style={styles.section}>
        <Text variant="small" tone="muted">
          Entraste como
        </Text>
        <Text variant="title">{email}</Text>
      </View>
      <View style={styles.section}>
        <View style={styles.statusRow} accessibilityLiveRegion="polite">
          {syncing && <ActivityIndicator size="small" color={colors.ink} />}
          <Text tone={syncStatus.kind === "error" ? "redPen" : "text"}>
            {syncStatusText(syncStatus, now)}
          </Text>
        </View>
        {syncStatus.kind === "error" ? (
          <>
            <Text variant="small" tone="muted">
              Revisa tu conexión. Tu progreso está a salvo en este dispositivo.
            </Text>
            <Button label="Reintentar" variant="secondary" onPress={onSyncNow} />
          </>
        ) : (
          <Button
            label="Sincronizar ahora"
            variant="secondary"
            onPress={onSyncNow}
            disabled={syncing}
          />
        )}
      </View>
      <View style={styles.footer}>
        <Button label="Cerrar sesión" variant="text" onPress={onSignOut} />
        <Button
          label="Eliminar cuenta"
          variant="text"
          accessibilityHint="Borra tu cuenta y el progreso guardado en el servidor"
          onPress={onDeleteAccount}
        />
      </View>
    </>
  );
}

/** The account page: sign-in (web, on the app's site), sync status and account actions. */
export function AccountView(props: AccountViewProps) {
  const styles = useStyles();
  const { availability, email, notice, onSignIn, onOpenPrivacy } = props;
  return (
    <ScreenContainer title={TITLE}>
      {notice !== null && <Notice notice={notice} />}

      {availability === "native" && (
        <View style={styles.section}>
          <Text variant="title">Disponible próximamente en la app</Text>
          <Text>
            Por ahora puedes guardar tu progreso con una cuenta en la versión web. En la app tu
            progreso queda guardado en este dispositivo.
          </Text>
        </View>
      )}

      {availability === "wrong-origin" && (
        <View style={styles.section}>
          <Text variant="title">Las cuentas están en english.maumar.com.ar</Text>
          <Text>
            Para guardar tu progreso en una cuenta, abre la app en https://english.maumar.com.ar.
            Pronto vas a poder llevar el progreso de esta dirección a tu cuenta.
          </Text>
        </View>
      )}

      {availability === "available" && email === null && (
        <>
          <View style={styles.section}>
            <Text variant="title">Guarda tu progreso y úsalo en otros dispositivos.</Text>
            <Text>
              Es opcional: la app funciona igual sin cuenta y sin conexión. Con una cuenta, tu
              progreso se sincroniza solo cuando hay internet.
            </Text>
          </View>
          <Button label="Continuar con Google" onPress={onSignIn} />
          <View style={styles.section}>
            <Text variant="small" tone="muted">
              Guardamos tu email, tu identificador de Google y tu progreso de aprendizaje, solo para
              sincronizarlo. Sin publicidad ni rastreo.
            </Text>
            <PrivacyLink onPress={onOpenPrivacy} />
          </View>
        </>
      )}

      {availability === "available" && email !== null && <SignedIn {...props} email={email} />}

      {availability === "available" && email !== null && <PrivacyLink onPress={onOpenPrivacy} />}
    </ScreenContainer>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    section: { gap: spacing.sm },
    statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    footer: {
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.rule,
    },
    link: {
      alignSelf: "flex-start",
      minHeight: TOUCH_TARGET - 4,
      paddingVertical: spacing.sm + 2,
      textDecorationLine: "underline",
    },
  }),
);
