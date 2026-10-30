import { Modal, StyleSheet, Text, View } from "react-native";
import { Button } from "./button";
import { colors, radius, spacing } from "./theme";

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** In-app confirmation (works the same on web, where `Alert` and `window.confirm` do not fit). */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View
          accessibilityRole="alert"
          accessibilityLabel={title}
          accessibilityViewIsModal
          style={styles.dialog}
        >
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <Text style={styles.message}>{message}</Text>
          <Button label={cancelLabel} onPress={onCancel} />
          <Button label={confirmLabel} variant="secondary" onPress={onConfirm} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  dialog: {
    width: "100%",
    maxWidth: 420,
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  message: { fontSize: 16, color: colors.text },
});
