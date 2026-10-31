import { useContext, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { WIDE_BREAKPOINT } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { MAX_TEXT_WIDTH, spacing } from "@/shared/ui/theme";
import { themedStyles } from "@/shared/ui/use-theme";
import { BackArrowButton } from "./back-arrow-button";

type NotebookHeaderProps = {
  title: string;
  /** Title of the screen "back" returns to. */
  backTitle?: string | undefined;
  showBack: boolean;
  onBack: () => void;
  /** Header actions at the right of the title (e.g. the sound switch). */
  right?: ReactNode;
};

/**
 * The stack header on web: back button and title laid out in the page's reading column (and,
 * on wide screens, next to the notebook margin), so they line up with the content below.
 * Native platforms keep their native header.
 */
export function NotebookHeader({ title, backTitle, showBack, onBack, right }: NotebookHeaderProps) {
  const styles = useStyles();
  const insets = useContext(SafeAreaInsetsContext);
  const wide = useWindowDimensions().width >= WIDE_BREAKPOINT;
  return (
    <View style={[styles.bar, wide && styles.barWide, { paddingTop: insets?.top ?? 0 }]}>
      <View style={styles.column}>
        {wide && <View style={styles.margin} />}
        {showBack && (
          <BackArrowButton
            label={backTitle === undefined ? "Volver" : `Volver a ${backTitle}`}
            onPress={onBack}
          />
        )}
        <Text
          accessibilityRole="header"
          variant="title"
          tone="ink"
          numberOfLines={1}
          style={styles.title}
        >
          {title}
        </Text>
        {right !== undefined && <View style={styles.right}>{right}</View>}
      </View>
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    bar: {
      alignItems: "center",
      paddingHorizontal: spacing.md,
      backgroundColor: colors.paper,
    },
    barWide: { paddingHorizontal: spacing.xxl },
    column: {
      width: "100%",
      maxWidth: MAX_TEXT_WIDTH,
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    // Continues the margin rule of the page below (`ScreenContainer`).
    margin: {
      position: "absolute",
      left: -spacing.xl,
      top: 0,
      bottom: 0,
      width: 1,
      backgroundColor: colors.rule,
    },
    title: { flexShrink: 1, flexGrow: 1 },
    // The action's icon lines up with the column's right edge.
    right: { marginRight: -spacing.sm - 4 },
  }),
);
