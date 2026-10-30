import { StyleSheet, View } from "react-native";
import { Button } from "@/shared/ui/button";
import { Text } from "@/shared/ui/text";
import { MAX_TEXT_WIDTH, spacing } from "@/shared/ui/theme";
import { themedStyles } from "@/shared/ui/use-theme";

type UpdateBannerViewProps = {
  /** The learner pressed "Actualizar": the page reloads as soon as the new version is active. */
  applying: boolean;
  onUpdate: () => void;
};

const MESSAGE = "Hay una versión nueva";

/**
 * A slip of paper pinned above the page (sheet, hairline border, hard offset shadow, like the
 * word lookup card), in the page flow so it never covers a lesson's buttons.
 */
export function UpdateBannerView({ applying, onUpdate }: UpdateBannerViewProps) {
  const styles = useStyles();
  return (
    <View style={styles.band}>
      <View
        accessibilityLabel={MESSAGE}
        accessibilityLiveRegion="polite"
        role="status"
        style={styles.slip}
      >
        <Text variant="bodyStrong" style={styles.message}>
          {MESSAGE}
        </Text>
        <Button
          label={applying ? "Actualizando…" : "Actualizar"}
          variant="secondary"
          disabled={applying}
          onPress={onUpdate}
        />
      </View>
    </View>
  );
}

const useStyles = themedStyles(({ colors, scheme }) =>
  StyleSheet.create({
    band: {
      backgroundColor: colors.paper,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    slip: {
      width: "100%",
      maxWidth: MAX_TEXT_WIDTH,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.sheet,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: colors.rule,
      borderRadius: 2,
      boxShadow: `3px 3px 0 ${scheme === "dark" ? "#08101F" : colors.rule}`,
    },
    message: { flexGrow: 1, flexShrink: 1 },
  }),
);
