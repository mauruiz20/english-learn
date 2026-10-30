import { StyleSheet, Text, type TextProps } from "react-native";
import { fonts } from "./theme";
import { useTheme } from "./use-theme";

/**
 * The teacher's handwritten note in red pen (Caveat). The only place the handwriting font is
 * used, apart from the grade on the summary page (`variant="grade"`).
 */
export function MarginNote({
  variant = "note",
  style,
  ...props
}: TextProps & { variant?: "note" | "grade" }) {
  const { colors } = useTheme();
  return <Text {...props} style={[styles[variant], { color: colors.redPen }, style]} />;
}

const styles = StyleSheet.create({
  note: { fontFamily: fonts.hand, fontSize: 25, lineHeight: 30 },
  grade: { fontFamily: fonts.hand, fontSize: 56, lineHeight: 60 },
});
