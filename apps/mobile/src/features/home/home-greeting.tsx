import { StyleSheet, View } from "react-native";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";

/** "Hola, Mauricio" with the signed-in learner's first name; a plain "¡Hola!" without one. */
export function greetingText(name: string | undefined): string {
  return name === undefined ? "¡Hola!" : `Hola, ${name}`;
}

/**
 * The first line of home: a heading written in ink at the top of the notebook page, like a
 * name on the cover. One line: a long name is cut at the end with an ellipsis, while screen
 * readers get it whole. It does not move, so reduced motion has nothing to stop.
 */
export function HomeGreeting({ name }: { name?: string | undefined }) {
  const text = greetingText(name);
  return (
    <View style={styles.wrapper}>
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
    </View>
  );
}

const styles = StyleSheet.create({ wrapper: { paddingHorizontal: spacing.xs } });
