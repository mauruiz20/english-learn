import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useGlossary } from "@/features/glossary/glossary-provider";
import { GlossaryRuns } from "@/features/glossary/glossary-text";
import { useSoundPlayer } from "@/infrastructure/services/app-services";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import { themedStyles } from "@/shared/ui/use-theme";
import { lookupEnabled } from "../model/lookup-policy";
import {
  dropOnLine,
  insertionIndex,
  moveWithinLine,
  type Point,
  type Rect,
} from "../model/word-order-line";
import { DraggableStrip, type ViewRef } from "./draggable-strip";
import { ExerciseLayout, Prompt } from "./exercise-layout";
import type { ExerciseProps } from "./types";

/** How far around the answer line a dropped strip still counts as dropped on it. */
const LINE_SLACK = 24;

const MOVE_LEFT = { name: "moveLeft", label: "Mover a la izquierda" } as const;
const MOVE_RIGHT = { name: "moveRight", label: "Mover a la derecha" } as const;

function measure(view: ViewRef): Promise<Rect> {
  return new Promise((resolve) =>
    view.measureInWindow((x, y, width, height) => resolve({ x, y, width, height })),
  );
}

function contains(rect: Rect, point: Point, slack: number) {
  return (
    point.x >= rect.x - slack &&
    point.x <= rect.x + rect.width + slack &&
    point.y >= rect.y - slack &&
    point.y <= rect.y + rect.height + slack
  );
}

/**
 * Build the sentence from paper strips. Tap a word to add it to the line and a placed word to send
 * it back (the accessible path, with screen-reader actions to move a placed word left or right),
 * or drag strips onto the line, within it to reorder, and off it to send them back. Tokens are
 * tracked by index, so repeated words stay independent.
 */
export function WordOrderExercise({
  prepared,
  disabled,
  reveal = false,
  onSubmit,
}: ExerciseProps<"word_order">) {
  const styles = useStyles();
  const sounds = useSoundPlayer();
  const { tokens } = prepared;
  // Looking each token up would hand out the sentence: locked until the answer is checked.
  const lookup = useGlossary() !== null && lookupEnabled("word_order.tokens", reveal);
  const lookupContent = (token: string) => (lookup ? <GlossaryRuns text={token} /> : undefined);
  const [built, setBuilt] = useState<readonly number[]>([]);
  // A dropped strip is rendered anew (a new key: its drop count) and settles from where it was
  // dropped.
  const [drops, setDrops] = useState<Readonly<Record<number, number>>>({});
  const [landing, setLanding] = useState<{ token: number; at: Point } | null>(null);

  const place = (next: readonly number[]) => {
    sounds.play("tap");
    setBuilt(next);
  };

  // Drag and drop works on window coordinates measured when a drag starts.
  const line = useRef<ViewRef>(null);
  const views = useRef(new Map<number, ViewRef>());
  const measured = useRef<{ line: Rect | null; strips: Map<number, Rect> }>({
    line: null,
    strips: new Map(),
  });
  const latestBuilt = useRef(built);
  useEffect(() => {
    latestBuilt.current = built;
  }, [built]);

  const register = useCallback((token: number, view: ViewRef | null) => {
    if (view === null) views.current.delete(token);
    else views.current.set(token, view);
  }, []);

  const onDragStart = useCallback((dragged: number) => {
    const strips = new Map<number, Rect>();
    measured.current = { line: null, strips };
    const lineView = line.current;
    if (lineView !== null) void measure(lineView).then((rect) => (measured.current.line = rect));
    for (const token of [dragged, ...latestBuilt.current]) {
      const view = views.current.get(token);
      if (view !== undefined) void measure(view).then((rect) => strips.set(token, rect));
    }
  }, []);

  const onDrop = (token: number, dx: number, dy: number): boolean => {
    const current = latestBuilt.current;
    const from = measured.current.strips.get(token);
    const lineRect = measured.current.line;
    if (from === undefined || lineRect === null) return false;
    const center = { x: from.x + from.width / 2 + dx, y: from.y + from.height / 2 + dy };
    let next = current;
    if (contains(lineRect, center, LINE_SLACK)) {
      const others = current
        .filter((t) => t !== token)
        .flatMap((t) => measured.current.strips.get(t) ?? []);
      next = dropOnLine(current, token, insertionIndex(others, center));
    } else if (current.includes(token)) {
      // Dragged off the line: back to the bank.
      next = current.filter((t) => t !== token);
    }
    if (next.length === current.length && next.every((t, i) => t === current[i])) return false;
    setLanding({ token, at: { x: from.x + dx, y: from.y + dy } });
    setDrops((previous) => ({ ...previous, [token]: (previous[token] ?? 0) + 1 }));
    place(next);
    return true;
  };

  const strip = (token: number) => {
    const word = tokens[token] ?? "";
    const dropped = landing?.token === token;
    return {
      // A new key per drop, so the dropped strip mounts where it lands and settles there.
      key: `${token}-${drops[token] ?? 0}`,
      token,
      text: word,
      disabled,
      lockedContent: lookupContent(word),
      register,
      onDragStart,
      onDrop,
      landing: dropped ? landing.at : undefined,
    };
  };

  const pool = tokens.map((_, i) => i).filter((i) => !built.includes(i));
  const builtTokens = built.map((i) => tokens[i] ?? "");

  return (
    <ExerciseLayout
      instruction="Ordena las palabras"
      canSubmit={!disabled && pool.length === 0}
      locked={disabled}
      onSubmit={() => onSubmit({ kind: "tokens", tokens: builtTokens })}
    >
      {prepared.exercise.es !== undefined && <Prompt text={prepared.exercise.es} />}
      {/* The answer line: paper strips laid on a ruled line. */}
      <View ref={line} accessibilityLabel="Tu frase" style={[styles.row, styles.answer]}>
        {built.length === 0 && <Text tone="muted">Toca o arrastra las palabras en orden</Text>}
        {built.map((index, position) => {
          const { key, ...props } = strip(index);
          const actions = [
            ...(position > 0 ? [MOVE_LEFT] : []),
            ...(position < built.length - 1 ? [MOVE_RIGHT] : []),
          ];
          return (
            <DraggableStrip
              key={key}
              {...props}
              label={`Quitar ${tokens[index] ?? ""}`}
              onPress={() => place(built.filter((_, p) => p !== position))}
              accessibilityActions={disabled ? undefined : actions}
              onAccessibilityAction={(name) => {
                if (name === MOVE_LEFT.name) place(moveWithinLine(built, position, position - 1));
                if (name === MOVE_RIGHT.name) place(moveWithinLine(built, position, position + 2));
              }}
            />
          );
        })}
      </View>
      <View accessibilityLabel="Palabras disponibles" style={[styles.row, styles.bank]}>
        {pool.map((index) => {
          const { key, ...props } = strip(index);
          return (
            <DraggableStrip
              key={key}
              {...props}
              label={tokens[index] ?? ""}
              onPress={() => place([...built, index])}
            />
          );
        })}
      </View>
    </ExerciseLayout>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    answer: {
      minHeight: 64,
      alignItems: "center",
      paddingBottom: spacing.sm,
      borderBottomWidth: 2,
      borderBottomColor: colors.ink,
    },
    bank: { minHeight: 48 },
  }),
);
