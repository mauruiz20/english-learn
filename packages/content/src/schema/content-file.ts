import { z } from "zod";
import { CardSchema } from "./card";
import { DialogueSchema } from "./dialogue";
import { ExerciseSchema } from "./exercise";
import { GlossaryEntrySchema } from "./glossary";
import { ItemSchema, LessonSchema, PassageSchema } from "./entities";
import { PlacementQuestionSchema } from "./placement";
import { PracticeCollectionSchema } from "./practice";

/** One JSON file under data/. The corpus is the union of many such files. */
export const ContentFileSchema = z.strictObject({
  items: z.array(ItemSchema).optional(),
  exercises: z.array(ExerciseSchema).optional(),
  passages: z.array(PassageSchema).optional(),
  lessons: z.array(LessonSchema).optional(),
  placement: z.array(PlacementQuestionSchema).optional(),
  glossary: z.array(GlossaryEntrySchema).optional(),
  cards: z.array(CardSchema).optional(),
  /** "Práctica libre" collections (only under `data/practice/`). */
  practice: z.array(PracticeCollectionSchema).optional(),
  /** Interactive dialogues (only under `data/practice/<collection>/`). */
  dialogues: z.array(DialogueSchema).optional(),
});
export type ContentFile = z.infer<typeof ContentFileSchema>;
