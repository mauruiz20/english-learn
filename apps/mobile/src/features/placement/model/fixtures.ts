/** Placement test fixtures (only imported by tests). The correct option is always "ok". */
import type { PlacementQuestion } from "@english-learn/content";
import { LEVELS } from "@english-learn/domain";

const source = { kind: "original" } as const;

export function placementBank(perLevel = 3): PlacementQuestion[] {
  return LEVELS.flatMap((level) =>
    Array.from({ length: perLevel }, (_, i): PlacementQuestion => {
      const id = `placement.${level.toLowerCase()}.${String(i + 1).padStart(3, "0")}`;
      switch (i % 3) {
        case 0:
          return {
            id,
            level,
            exercise: {
              source,
              type: "vocab",
              prompt: `What does '${id}' mean?`,
              options: ["no", "ok", "nope"],
              answerIndex: 1,
            },
          };
        case 1:
          return {
            id,
            level,
            exercise: {
              source,
              type: "cloze",
              sentence: `${id}: it is ___.`,
              answers: ["ok"],
              distractors: ["no", "nope", "never"],
            },
          };
        default:
          return {
            id,
            level,
            exercise: {
              source,
              type: "translation_choice",
              sentence: `Translate ${id}.`,
              options: ["ok", "no"],
              answerIndex: 0,
            },
          };
      }
    }),
  );
}
