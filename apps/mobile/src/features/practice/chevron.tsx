import Svg, { Path } from "react-native-svg";
import { useTheme } from "@/shared/ui/use-theme";

/** The ink arrow at the end of a row that opens something (decorative). */
export function Chevron() {
  const { colors } = useTheme();
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" aria-hidden>
      <Path
        d="M9 5l7 7-7 7"
        fill="none"
        stroke={colors.ink}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
