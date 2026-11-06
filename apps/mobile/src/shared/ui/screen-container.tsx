import { useContext, useRef, type ComponentRef, type ReactNode } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { Text } from "./text";
import { MAX_TEXT_WIDTH, spacing } from "./theme";
import { themedStyles, useTheme } from "./use-theme";

/** From this window width the page is laid out as a centered notebook page with a margin. */
export const WIDE_BREAKPOINT = 768;

type ScreenContainerProps = {
  /** Page heading (accessibility header). */
  title?: string;
  /** Shown at the right of the title (e.g. the teacher's grade). */
  aside?: ReactNode;
  /** Above the title, full column width (e.g. the lesson progress line). */
  top?: ReactNode;
  children?: ReactNode;
  /** Pinned below the scrolling page (e.g. answer feedback with "Continuar"). */
  footer?: ReactNode;
  /** Tints the footer as the band of a checked answer. */
  footerTone?: "correct" | "almost" | "wrong" | undefined;
  /** The screen has no navigation header: keep clear of the status bar / notch. */
  insetTop?: boolean;
  /** Keeps the end of the page in view as it grows (a chat): scrolls down when content is added. */
  followEnd?: boolean;
};

/**
 * A page of the notebook: paper background, one centered reading column (≤ 560 px) and, on wide
 * screens, the notebook's margin rule at the left of the column.
 */
export function ScreenContainer({
  title,
  aside,
  top,
  children,
  footer,
  footerTone,
  insetTop = false,
  followEnd = false,
}: ScreenContainerProps) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const band = footerTone === undefined ? undefined : colors.feedback[footerTone];
  // Null outside a SafeAreaProvider (unit tests render views on their own).
  const insets = useContext(SafeAreaInsetsContext);
  const wide = useWindowDimensions().width >= WIDE_BREAKPOINT;
  return (
    <View style={styles.page}>
      <ScrollView
        ref={scroll}
        {...(followEnd
          ? { onContentSizeChange: () => scroll.current?.scrollToEnd({ animated: false }) }
          : {})}
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          wide && styles.contentWide,
          insetTop && { paddingTop: (insets?.top ?? 0) + (wide ? spacing.xxl : spacing.lg) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.column, wide && styles.columnWide]}>
          {wide && <View style={styles.margin} />}
          {top}
          {(title !== undefined || aside !== undefined) && (
            <View style={styles.titleRow}>
              {title !== undefined && (
                <Text
                  accessibilityRole="header"
                  variant={wide ? "display" : "heading"}
                  style={styles.title}
                >
                  {title}
                </Text>
              )}
              {aside}
            </View>
          )}
          {children}
        </View>
      </ScrollView>
      {footer !== undefined && (
        <View
          testID="screen-footer"
          style={[
            styles.footer,
            { paddingBottom: (insets?.bottom ?? 0) + spacing.md },
            band !== undefined && {
              backgroundColor: band.tint,
              borderTopColor: band.ink,
              borderTopWidth: 3,
            },
          ]}
        >
          <View style={styles.footerColumn}>{footer}</View>
        </View>
      )}
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.paper },
    scroll: { flex: 1 },
    content: {
      flexGrow: 1,
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl,
    },
    contentWide: { paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl },
    column: { width: "100%", maxWidth: MAX_TEXT_WIDTH, gap: spacing.lg },
    columnWide: { flexGrow: 1 },
    // The notebook margin: a hairline at the left of the column, the full page height.
    margin: {
      position: "absolute",
      left: -spacing.xl,
      top: -spacing.xxl,
      bottom: -spacing.xl,
      width: 1,
      backgroundColor: colors.rule,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    title: { flexShrink: 1 },
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.rule,
      backgroundColor: colors.paper,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      alignItems: "center",
    },
    footerColumn: { width: "100%", maxWidth: MAX_TEXT_WIDTH },
  }),
);
