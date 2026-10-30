import type { Verdict } from "@english-learn/domain";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/shared/ui/button";
import { colors, radius, spacing } from "@/shared/ui/theme";

const TITLES: Readonly<Record<Verdict, string>> = {
  correct: "Correcto",
  almost: "¡Casi!",
  wrong: "Incorrecto",
};

const TONES: Readonly<Record<Verdict, string>> = {
  correct: colors.success,
  almost: colors.warning,
  wrong: colors.danger,
};

type AnswerFeedbackProps = {
  verdict: Verdict;
  correctAnswer: string;
  onContinue: () => void;
};

export function AnswerFeedback({ verdict, correctAnswer, onContinue }: AnswerFeedbackProps) {
  return (
    <View style={[styles.panel, { borderColor: TONES[verdict] }]}>
      <Text
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[styles.title, { color: TONES[verdict] }]}
      >
        {TITLES[verdict]}
      </Text>
      {verdict !== "correct" && (
        <Text style={styles.answer}>{`Respuesta correcta: ${correctAnswer}`}</Text>
      )}
      <Button label="Continuar" onPress={onContinue} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    backgroundColor: colors.surface,
  },
  title: { fontSize: 22, fontWeight: "700" },
  answer: { fontSize: 17, lineHeight: 24, color: colors.text },
});
