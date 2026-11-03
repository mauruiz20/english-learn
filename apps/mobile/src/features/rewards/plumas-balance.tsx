import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Sticker } from "@/shared/ui/sticker";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import { useTheme } from "@/shared/ui/use-theme";
import { FEATHER_PATH, PLUMAS_COLOR } from "./feather";
import { balanceLabel, formatPlumas } from "./model/plumas-copy";

/** A small feather sticker, the mark of plumas (decorative). */
export function FeatherSticker({ size = 30 }: { size?: number }) {
  const { colors } = useTheme();
  const glyph = Math.round(size * 0.5);
  return (
    <Sticker color={PLUMAS_COLOR} size={size} tilt={8}>
      <Svg width={glyph} height={glyph} viewBox="0 0 24 24" aria-hidden>
        <Path
          d={FEATHER_PATH}
          fill="none"
          stroke={colors.onHighlighter}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Sticker>
  );
}

/**
 * The learner's plumas on home, beside the XP: "135 plumas" with a feather sticker; read as
 * "Tienes 135 plumas" (or "Debes 30 plumas" after concurrent offline purchases).
 */
export function PlumasBalance({ balance }: { balance: number }) {
  return (
    <View
      testID="home-plumas"
      accessible
      accessibilityRole="text"
      accessibilityLabel={balanceLabel(balance)}
      style={styles.row}
    >
      <FeatherSticker />
      <Text variant="bodyStrong" tone="ink">
        {balance < 0 ? `Debes ${formatPlumas(-balance)}` : formatPlumas(balance)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
