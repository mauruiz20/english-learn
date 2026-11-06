import { ActivityIndicator, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Button } from "@/shared/ui/button";
import { Avi } from "@/shared/ui/mascot";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Sticker } from "@/shared/ui/sticker";
import { Text } from "@/shared/ui/text";
import { radius, spacing } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import type { Achievement } from "./model/achievements";

export type AlbumViewState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly unlocked: readonly string[] };

const STAR = "M12 3 14.6 9 21 9.6 16.2 13.8 17.6 20.2 12 16.9 6.4 20.2 7.8 13.8 3 9.6 9.4 9Z";

/**
 * The album: every sticker the learner can earn, won ones stuck on the page (rare ones with a
 * holographic rim), the rest as dashed slots that say how to win them. Nothing here moves.
 */
export function AlbumView({
  state,
  achievements,
  onGoHome,
}: {
  state: AlbumViewState;
  /** The stickers to show, in order (`albumAchievements`). */
  achievements: readonly Achievement[];
  onGoHome: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <ScreenContainer title="Tu álbum">
      {state.status === "loading" && (
        <ActivityIndicator accessibilityLabel="Cargando tu álbum" color={colors.ink} />
      )}
      {state.status === "error" && (
        <Text accessibilityRole="alert" tone="redPen">
          No pudimos cargar tu álbum.
        </Text>
      )}
      {state.status === "ready" && (
        <>
          <View style={styles.intro}>
            <Avi mood={state.unlocked.length > 0 ? "cheer" : "happy"} size={56} />
            <View style={styles.introText}>
              <Text variant="title">
                {`${state.unlocked.length} de ${achievements.length} insignias`}
              </Text>
              <Text tone="muted">Cada lección, racha y tema te acerca a una nueva.</Text>
            </View>
          </View>
          <View style={styles.grid}>
            {achievements.map((a, i) => (
              <AlbumSlot key={a.id} achievement={a} won={state.unlocked.includes(a.id)} index={i} />
            ))}
          </View>
          <Button label="Seguir aprendiendo" onPress={onGoHome} />
        </>
      )}
    </ScreenContainer>
  );
}

function AlbumSlot({
  achievement,
  won,
  index,
}: {
  achievement: Achievement;
  won: boolean;
  index: number;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const label = won
    ? `${achievement.title}, conseguida`
    : `${achievement.title}, por conseguir. ${achievement.howTo}`;
  return (
    <View accessible accessibilityLabel={label} style={styles.slot}>
      <Sticker
        color={achievement.color}
        state={won ? "done" : "pending"}
        size={64}
        tilt={[-6, 4, -2, 7][index % 4] ?? 0}
        style={won && achievement.rare === true ? styles.rare : undefined}
      >
        <Svg width={26} height={26} viewBox="0 0 24 24">
          <Path
            d={STAR}
            fill={won ? colors.onHighlighter : "none"}
            stroke={won ? colors.onHighlighter : colors.textMuted}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
        </Svg>
      </Sticker>
      <Text variant="smallStrong" style={styles.slotTitle}>
        {achievement.title}
      </Text>
      {!won && (
        <Text variant="small" tone="muted" style={styles.slotTitle}>
          {achievement.howTo}
        </Text>
      )}
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    intro: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    introText: { flexShrink: 1, gap: 2 },
    grid: { flexDirection: "row", flexWrap: "wrap", columnGap: "3%", rowGap: spacing.sm },
    slot: {
      // Three per row, in the reading column.
      width: "31.33%",
      minHeight: 150,
      alignItems: "center",
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.sheet,
      boxShadow: `0 3px 0 ${colors.rule}`,
    },
    slotTitle: { textAlign: "center" },
    // A rare sticker's holographic rim.
    rare: { boxShadow: "0 0 0 3px #FF8FC7, 0 0 0 6px #5CC8FF, 0 0 0 9px #FFD23F" },
  }),
);
