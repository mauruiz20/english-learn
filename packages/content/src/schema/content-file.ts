import { z } from "zod";
import { ExerciseSchema } from "./exercise";
import { GlossaryEntrySchema } from "./glossary";
import { ItemSchema, LessonSchema, PassageSchema } from "./entities";
import { PlacementQuestionSchema } from "./placement";

/** One JSON file under data/. The corpus is the union of many such files. */
export const ContentFileSchema = z.strictObject({
  items: z.array(ItemSchema).optional(),
  exercises: z.array(ExerciseSchema).optional(),
  passages: z.array(PassageSchema).optional(),
  lessons: z.array(LessonSchema).optional(),
  placement: z.array(PlacementQuestionSchema).optional(),
  glossary: z.array(GlossaryEntrySchema).optional(),
});
export type ContentFile = z.infer<typeof ContentFileSchema>;
