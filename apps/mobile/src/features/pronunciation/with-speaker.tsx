import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { spacing } from "@/shared/ui/theme";
import { usePronunciation } from "./pronunciation";
import { SpeakButton } from "./speak-button";

/**
 * English text with its speaker on the right (`SpeakButton`), top-aligned so a wrapped sentence
 * keeps it beside its first line. Without pronunciation it is just the text.
 */
export function WithSpeaker({
  text,
  label,
  children,
  style,
}: {
  /** What the speaker says. */
  text: string;
  label?: string | undefined;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { available } = usePronunciation();
  if (!available || text.trim() === "") return <View style={style}>{children}</View>;
  return (
    <View style={[styles.row, style]}>
      <View style={styles.text}>{children}</View>
      <SpeakButton text={text} label={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  text: { flex: 1, minWidth: 0 },
});
