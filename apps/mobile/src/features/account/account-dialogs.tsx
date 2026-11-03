import { Modal, StyleSheet, View } from "react-native";
import { Button } from "@/shared/ui/button";
import { ChoiceRow } from "@/shared/ui/choice-row";
import { Text } from "@/shared/ui/text";
import { radius, spacing } from "@/shared/ui/theme";
import { themedStyles } from "@/shared/ui/use-theme";

function Sheet({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View accessibilityLabel={title} accessibilityViewIsModal style={styles.dialog}>
          <Text accessibilityRole="header" variant="heading">
            {title}
          </Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** Sign out, choosing what happens to this device's progress (kept by default). */
export function SignOutDialog({
  keepLocalProgress,
  busy,
  onChoose,
  onConfirm,
  onCancel,
}: {
  keepLocalProgress: boolean;
  busy: boolean;
  onChoose: (keep: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  return (
    <Sheet title="¿Cerrar sesión?" onCancel={onCancel}>
      <Text>¿Qué hacemos con tu progreso en este dispositivo?</Text>
      <View accessibilityRole="radiogroup" style={styles.choices}>
        <ChoiceRow
          label="Conservar mi progreso en este dispositivo"
          checked={keepLocalProgress}
          disabled={busy}
          onPress={() => onChoose(true)}
        />
        <ChoiceRow
          label="Borrarlo de este dispositivo (sigue guardado en tu cuenta)"
          checked={!keepLocalProgress}
          disabled={busy}
          onPress={() => onChoose(false)}
        />
      </View>
      <View style={styles.actions}>
        <Button label="Cancelar" onPress={onCancel} disabled={busy} />
        <Button
          label="Cerrar sesión ahora"
          variant="secondary"
          onPress={onConfirm}
          disabled={busy}
        />
      </View>
    </Sheet>
  );
}

/** Destructive: deletes the account and everything stored with it on the server. */
export function DeleteAccountDialog({
  busy,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  return (
    <Sheet title="¿Eliminar tu cuenta?" onCancel={onCancel}>
      <Text>
        Borramos del servidor tu cuenta y todo el progreso guardado en ella. No se puede deshacer.
        Tu progreso en este dispositivo se conserva.
      </Text>
      <Text variant="small" tone="muted">
        Si entraste con Google hace más de 5 minutos, te pediremos que vuelvas a entrar para
        confirmar que eres tú.
      </Text>
      <View style={styles.actions}>
        <Button label="Cancelar" onPress={onCancel} disabled={busy} />
        <Button
          label="Eliminar mi cuenta"
          variant="secondary"
          onPress={onConfirm}
          disabled={busy}
        />
      </View>
    </Sheet>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.md,
      backgroundColor: colors.scrim,
    },
    dialog: {
      width: "100%",
      maxWidth: 420,
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: colors.sheet,
      borderWidth: 1,
      borderColor: colors.rule,
    },
    choices: { gap: spacing.sm },
    actions: { gap: spacing.sm, marginTop: spacing.sm },
  }),
);
