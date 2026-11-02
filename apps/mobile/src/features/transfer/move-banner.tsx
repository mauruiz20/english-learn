import { StyleSheet, View } from "react-native";
import { Button } from "@/shared/ui/button";
import { Sticker } from "@/shared/ui/sticker";
import { Text } from "@/shared/ui/text";
import { radius, spacing } from "@/shared/ui/theme";
import { themedStyles } from "@/shared/ui/use-theme";
import type { TransferFailure } from "./application/transfer-progress";
import { failureText } from "./model/failure-text";

export type MoveBannerStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "sending" }
  | { readonly kind: "failed"; readonly failure: TransferFailure };

export type MoveBannerProps = {
  /** The new address, shown by its host name. */
  newOrigin: string;
  status: MoveBannerStatus;
  onTake: () => void;
  onSkip: () => void;
};

/**
 * On the old web address, at the top of home: the app moved, take your progress along (one
 * press) or go without it. A sticker on a sheet, so it reads as the notebook's own news.
 */
export function MoveBanner({ newOrigin, status, onTake, onSkip }: MoveBannerProps) {
  const styles = useStyles();
  const sending = status.kind === "sending";
  return (
    <View style={styles.banner}>
      <View style={styles.header}>
        <Sticker color="yellow" size={44} tilt={-8} />
        <Text variant="title" accessibilityRole="header" style={styles.title}>
          {`La app se mudó a ${new URL(newOrigin).host}`}
        </Text>
      </View>
      <Text>Lleva tu progreso a la nueva dirección con un clic. Aquí no se borra nada.</Text>
      {status.kind === "failed" && (
        <Text accessibilityRole="alert" tone="redPen">
          {failureText(status.failure)}
        </Text>
      )}
      <View style={styles.actions}>
        <Button
          label={sending ? "Llevando tu progreso…" : "Llevar mi progreso"}
          onPress={onTake}
          disabled={sending}
        />
        <Button label="Ir sin mi progreso" variant="text" onPress={onSkip} disabled={sending} />
      </View>
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    banner: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.ink,
      backgroundColor: colors.sheet,
      boxShadow: `0 4px 0 ${colors.ink}`,
    },
    header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    title: { flexShrink: 1 },
    actions: { gap: spacing.xs, alignItems: "flex-start" },
  }),
);
