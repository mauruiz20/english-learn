import Svg, { Circle, Path } from "react-native-svg";
import { useTheme } from "@/shared/ui/use-theme";

const CHECK = "M7 12.5l3.2 3.2L17 9";

/**
 * Today's progress toward the daily goal as a ring drawn in ink over a pale rule; a met goal is
 * a full yellow ring with a check. Static (nothing animates) and decorative: the caller carries
 * the label.
 */
export function GoalRing({
  done,
  target,
  size = 44,
}: {
  done: number;
  target: number;
  size?: number;
}) {
  const { colors } = useTheme();
  const stroke = Math.max(4, Math.round(size / 8));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = target <= 0 ? 1 : Math.min(1, Math.max(0, done / target));
  const met = fraction >= 1;
  const c = size / 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <Circle cx={c} cy={c} r={r} fill="none" stroke={colors.rule} strokeWidth={stroke} />
      {fraction > 0 && (
        <Circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={met ? colors.highlighters.yellow : colors.ink}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * fraction} ${circumference}`}
          // Starts at the top, like a clock hand.
          transform={`rotate(-90 ${c} ${c})`}
        />
      )}
      {met && (
        <Path
          d={CHECK}
          transform={`translate(${c - 12} ${c - 12})`}
          fill="none"
          stroke={colors.text}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}
