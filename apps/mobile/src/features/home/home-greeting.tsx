import { StyleSheet, View } from "react-native";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import { HomeAvi } from "./home-avi";
import type { HomeAviState } from "./model/home-avi";

/** "Hola, Mauricio" with the signed-in learner's first name; a plain "¡Hola!" without one. */
export function greetingText(name: string | undefined): string {
  return name === undefined ? "¡Hola!" : `Hola, ${name}`;
}

/** Avi beside the greeting: its state, its button's name, and whether home is focused. */
export type HomeGreetingAvi = {
  readonly state: HomeAviState;
  readonly label: string;
  readonly active: boolean;
};

/**
 * The first line of home: a heading written in ink at the top of the notebook page, like a
 * name on the cover. One line: a long name is cut at the end with an ellipsis, while screen
 * readers get it whole. Beside it, Avi in the learner's outfit, with its line in a speech
 * bubble under the heading; tapping Avi opens the wardrobe.
 */
export function HomeGreeting({
  name,
  avi,
  onOpenWardrobe,
}: {
  name?: string | undefined;
  avi?: HomeGreetingAvi | undefined;
  onOpenWardrobe?: (() => void) | undefined;
}) {
  const text = greetingText(name);
  const heading = (
    <Text
      accessibilityRole="header"
      accessibilityLabel={text}
      variant="heading"
      tone="ink"
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      {text}
    </Text>
  );
  return (
    <View style={styles.wrapper}>
      {avi === undefined || onOpenWardrobe === undefined ? (
        heading
      ) : (
        <HomeAvi state={avi.state} label={avi.label} active={avi.active} onPress={onOpenWardrobe}>
          {heading}
        </HomeAvi>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ wrapper: { paddingHorizontal: spacing.xs } });
