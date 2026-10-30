import { Platform, type TextStyle } from "react-native";
import type { Palette } from "./theme";

/**
 * Text struck through by the teacher's red pen. Android draws the line in the text color
 * (`textDecorationColor` is iOS / web only), so there the text itself turns red pen.
 */
export function struckText(colors: Palette): TextStyle {
  return {
    textDecorationLine: "line-through",
    textDecorationStyle: "solid",
    textDecorationColor: colors.redPen,
    // A firmer pen stroke on web (ignored elsewhere).
    ...({ textDecorationThickness: 2 } as object),
    ...(Platform.OS === "android" ? { color: colors.redPen } : {}),
  };
}
