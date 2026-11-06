import type { Card, CardExample } from "@english-learn/content";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { GlossaryText } from "@/features/glossary/glossary-text";
import { WithSpeaker } from "@/features/pronunciation/with-speaker";
import { levelHighlighter, topicHighlighter } from "@/features/topics/topic-colors";
import { topicLabel } from "@/features/topics/topic-labels";
import { Button } from "@/shared/ui/button";
import { Highlight } from "@/shared/ui/highlight";
import { RuledArea, ruledText } from "@/shared/ui/ruled-area";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { struckText } from "@/shared/ui/struck";
import { Text } from "@/shared/ui/text";
import { radius, spacing } from "@/shared/ui/theme";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import { PerfectBadge } from "@/features/lesson/components/perfect-badge";
import {
  scoreDescription,
  scoreText,
  type LessonScore,
} from "@/features/lesson/model/lesson-score";
import type { CardStatus } from "./model/card-catalog";

export type CardViewProps = {
  card: Card;
  /** null while the learner's progress loads. */
  status: CardStatus | null;
  /** Its best practice result; none while loading or if never practiced. */
  score?: LessonScore | undefined;
  /** Opened from a session's feedback ("Ver ficha"): offer to go back instead of practicing. */
  fromSession: boolean;
  onPractice: () => void;
  onBack: () => void;
};

const STATUS_LABEL: Readonly<Record<Exclude<CardStatus, "new">, string>> = {
  studied: "Estudiada",
  mastered: "Dominada",
};

/**
 * A study card as a page of the notebook: its kind and level, the summary, the form written on a
 * ruled card like a formula, when to use it, the typical mistakes (struck in red pen, then put
 * right), examples (English words can be looked up; never in a mistake) and, by kind, the phrasal
 * verbs or the collocations and the false friend. "Practicar" opens its exercises.
 */
export function CardView({ card, status, score, fromSession, onPractice, onBack }: CardViewProps) {
  const styles = useStyles();
  return (
    <ScreenContainer
      title={card.title}
      top={<CardTags card={card} status={status} />}
      footer={
        fromSession ? (
          <Button
            label="Volver al ejercicio"
            accessibilityHint="Sigues donde estabas"
            onPress={onBack}
          />
        ) : (
          <View style={styles.footer}>
            <View style={styles.footerMeta}>
              <Text variant="small" tone="muted">{`${card.exerciseIds.length} ejercicios`}</Text>
              {score !== undefined && <BestResult score={score} />}
            </View>
            {score === undefined ? (
              <Button
                label="Practicar"
                accessibilityHint="Ejercicios de esta ficha; después vuelven en tus repasos"
                onPress={onPractice}
              />
            ) : (
              <Button
                label="Practicar de nuevo"
                accessibilityHint="Ganas XP por cada respuesta; el bono de completarla ya lo recibiste"
                onPress={onPractice}
              />
            )}
          </View>
        )
      }
    >
      <Text>{card.summary}</Text>
      <FormCard form={card.form} />

      <Section title="Cuándo se usa">
        {card.uses.map((use) => (
          <View key={use} style={styles.bullet}>
            <Text aria-hidden tone="ink" style={styles.bulletMark}>
              •
            </Text>
            <Text style={styles.bulletText}>{use}</Text>
          </View>
        ))}
      </Section>

      {card.pitfalls.length > 0 && (
        <Section title="Errores comunes">
          {card.pitfalls.map((pitfall) => (
            <View key={pitfall.wrong} style={styles.pitfall}>
              <View style={styles.markRow}>
                <Mark kind="wrong" />
                {/* The mistake is never a lookup: its wrong forms must not teach anything. */}
                <Text
                  accessibilityLabel={`Incorrecto: ${pitfall.wrong}`}
                  tone="muted"
                  style={[styles.markText, styles.struck]}
                >
                  {pitfall.wrong}
                </Text>
              </View>
              <WithSpeaker text={pitfall.right}>
                <View style={styles.markRow}>
                  <Mark kind="right" />
                  <GlossaryText variant="bodyStrong" style={styles.markText} text={pitfall.right} />
                </View>
              </WithSpeaker>
              <Text variant="small" tone="muted" style={styles.why}>
                {pitfall.why}
              </Text>
            </View>
          ))}
        </Section>
      )}

      {card.kind === "phrasal_verbs" && (
        <Section title="Los verbos">
          {card.entries.some((e) => e.separable) && (
            <Text variant="small" tone="muted">
              Separable: el objeto puede ir entre el verbo y la partícula (turn it off).
            </Text>
          )}
          {card.entries.map((entry) => (
            <View key={entry.verb} style={styles.entry}>
              <WithSpeaker text={entry.verb}>
                <View style={styles.entryHead}>
                  <GlossaryText variant="title" tone="ink" text={entry.verb} />
                  {entry.separable && (
                    <View style={styles.chip}>
                      <Text variant="smallStrong" tone="ink">
                        separable
                      </Text>
                    </View>
                  )}
                </View>
              </WithSpeaker>
              <Text tone="muted">{entry.es}</Text>
              <Example example={entry.example} />
            </View>
          ))}
        </Section>
      )}

      {card.kind === "vocabulary" && card.collocations !== undefined && (
        <Section title="Combinaciones">
          {card.collocations.map((c) => (
            <Example key={c.en} example={c} />
          ))}
        </Section>
      )}

      {card.kind === "vocabulary" && card.falseFriend !== undefined && (
        <View style={styles.falseFriend}>
          <Text variant="smallStrong" tone="redPen">
            Falso amigo
          </Text>
          <WithSpeaker text={card.falseFriend.en}>
            <GlossaryText variant="heading" text={card.falseFriend.en} />
          </WithSpeaker>
          <Text>{`Parece: ${card.falseFriend.looksLike}`}</Text>
          <Text variant="bodyStrong">{`Significa: ${card.falseFriend.actually}`}</Text>
        </View>
      )}

      <Section title="Ejemplos">
        {card.examples.map((example) => (
          <Example key={example.en} example={example} />
        ))}
      </Section>
    </ScreenContainer>
  );
}

/**
 * The card's best practice result, like a done lesson's on the path: "Perfecta · 6/6" with the
 * star sticker, or "Completada · 5/6". Read as one label.
 */
function BestResult({ score }: { score: LessonScore }) {
  const styles = useStyles();
  return (
    <View
      accessible
      accessibilityLabel={`Tu mejor resultado: ${scoreDescription(score)}`}
      style={styles.bestResult}
    >
      {score.perfect && <PerfectBadge testID="card-perfect" size={24} />}
      <Text variant="smallStrong" tone="success">
        {scoreText(score)}
      </Text>
    </View>
  );
}

/** The card's topic label, its level and, once practiced, whether it is studied or mastered. */
function CardTags({ card, status }: { card: Card; status: CardStatus | null }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.tags}>
      <Highlight variant="smallStrong" color={topicHighlighter(card.topic)}>
        {topicLabel(card.topic)}
      </Highlight>
      <View
        style={[
          styles.level,
          { backgroundColor: colors.highlighters[levelHighlighter(card.level)] },
        ]}
      >
        <Text variant="smallStrong" style={{ color: colors.onHighlighter }}>
          {card.level}
        </Text>
      </View>
      {status !== null && status !== "new" && (
        <Text variant="smallStrong" tone="success">
          {STATUS_LABEL[status]}
        </Text>
      )}
    </View>
  );
}

/** The form, written large on a small ruled card, like a formula in the notebook. */
function FormCard({ form }: { form: string }) {
  const styles = useStyles();
  return (
    <View accessible accessibilityLabel={`Estructura: ${form}`} style={styles.formCard}>
      <Text variant="smallStrong" tone="muted">
        Estructura
      </Text>
      <RuledArea>
        <Text variant="title" tone="ink" style={ruledText}>
          {form}
        </Text>
      </RuledArea>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" variant="title">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** An English sentence (its words can be looked up) with its Spanish under it. */
function Example({ example }: { example: CardExample }) {
  const styles = useStyles();
  return (
    <WithSpeaker text={example.en}>
      <View style={styles.example}>
        <GlossaryText text={example.en} />
        <Text variant="small" tone="muted">
          {example.es}
        </Text>
      </View>
    </WithSpeaker>
  );
}

/** The teacher's cross (red pen) or check (green), before a mistake or its correction. */
function Mark({ kind }: { kind: "wrong" | "right" }) {
  const { colors } = useTheme();
  const color = kind === "wrong" ? colors.redPen : colors.success;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={kind === "wrong" ? "Incorrecto" : "Correcto"}
      style={markStyles.mark}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Path
          d={kind === "wrong" ? "M6 6 18 18 M18 6 6 18" : "M5 12.5 10 17 19 7"}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const markStyles = StyleSheet.create({
  mark: { width: 22, height: 25, justifyContent: "center" },
});

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    tags: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
    level: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 1 },
    formCard: {
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.sheet,
      borderWidth: 1,
      borderColor: colors.rule,
      boxShadow: `3px 3px 0 ${colors.rule}`,
    },
    section: { gap: spacing.sm },
    bullet: { flexDirection: "row", gap: spacing.sm },
    bulletMark: { width: 12 },
    bulletText: { flex: 1 },
    pitfall: {
      gap: 2,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.rule,
    },
    markRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
    markText: { flex: 1 },
    struck: struckText(colors),
    why: { marginLeft: 22 + spacing.xs },
    entry: {
      gap: 2,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.rule,
    },
    entryHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
    chip: {
      borderWidth: 1.5,
      borderColor: colors.ink,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
    },
    example: { gap: 2 },
    falseFriend: {
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: colors.redPen,
      backgroundColor: colors.sheet,
    },
    footer: { gap: spacing.xs, alignItems: "stretch" },
    footerMeta: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    bestResult: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  }),
);
