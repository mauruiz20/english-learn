import { useContext } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { WIDE_BREAKPOINT } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { MAX_TEXT_WIDTH, TOUCH_TARGET, spacing } from "@/shared/ui/theme";
import { themedStyles } from "@/shared/ui/use-theme";

type NotebookHeaderProps = {
  title: string;
  /** Title of the screen "back" returns to. */
  backTitle?: string | undefined;
  showBack: boolean;
  onBack: () => void;
};

/**
 * The stack header on web: back button and title laid out in the page's reading column (and,
 * on wide screens, next to the notebook margin), so they line up with the content below.
 * Native platforms keep their native header.
 */
export function NotebookHeader({ title, backTitle, showBack, onBack }: NotebookHeaderProps) {
  const styles = useStyles();
  const insets = useContext(SafeAreaInsetsContext);
  const wide = useWindowDimensions().width >= WIDE_BREAKPOINT;
  return (
    <View style={[styles.bar, wide && styles.barWide, { paddingTop: insets?.top ?? 0 }]}>
      <View style={styles.column}>
        {wide && <View style={styles.margin} />}
        {showBack && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backTitle === undefined ? "Volver" : `Volver a ${backTitle}`}
            onPress={onBack}
            hitSlop={4}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            {/* A pen-drawn arrow: a shaft and an open head. */}
            <View style={styles.arrow}>
              <View style={styles.shaft} />
              <View style={styles.head} />
            </View>
          </Pressable>
        )}
        <Text accessibilityRole="header" variant="title" tone="ink" numberOfLines={1}>
          {title}
        </Text>
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
    back: {
      width: TOUCH_TARGET,
      height: TOUCH_TARGET,
      // The arrow sits on the column edge, like the content below.
      marginLeft: -spacing.sm - 4,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: TOUCH_TARGET / 2,
    },
    pressed: { backgroundColor: colors.rule },
    arrow: { width: 20, height: 16, justifyContent: "center" },
    shaft: { height: 2.5, borderRadius: 1, backgroundColor: colors.ink },
    head: {
      position: "absolute",
      left: 1,
      width: 11,
      height: 11,
      borderLeftWidth: 2.5,
      borderBottomWidth: 2.5,
      borderColor: colors.ink,
      transform: [{ rotate: "45deg" }],
    },
  }),
);
