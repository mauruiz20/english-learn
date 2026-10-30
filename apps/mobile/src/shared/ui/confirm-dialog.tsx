import { Modal, StyleSheet, View } from "react-native";
import { Button } from "./button";
import { Text } from "./text";
import { radius, spacing } from "./theme";
import { themedStyles } from "./use-theme";

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
  const styles = useStyles();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View
          accessibilityRole="alert"
          accessibilityLabel={title}
          accessibilityViewIsModal
          style={styles.dialog}
        >
          <Text accessibilityRole="header" variant="heading">
            {title}
          </Text>
          <Text>{message}</Text>
          <View style={styles.actions}>
            <Button label={cancelLabel} onPress={onCancel} />
            <Button label={confirmLabel} variant="secondary" onPress={onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
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
    actions: { gap: spacing.sm, marginTop: spacing.sm },
  }),
);
