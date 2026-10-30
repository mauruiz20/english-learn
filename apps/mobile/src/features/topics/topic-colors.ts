import type { Corpus } from "@english-learn/content";
import type { Level, LocalDate } from "@english-learn/domain";
import type { HighlighterName } from "@/shared/ui/theme";

/** Highlighters a topic can get: every one but yellow, which means "correct". */
const TOPIC_PALETTE = [
  "pink",
  "green",
  "orange",
  "sky",
  "lilac",
] as const satisfies readonly HighlighterName[];

export type TopicHighlighter = (typeof TOPIC_PALETTE)[number];

/**
 * Each corpus topic's highlighter, like a colored tab in the notebook's index. Chosen by hand so
 * neighboring topics of a level's index never share a color (the tests check it against the
 * corpus); a topic missing here falls back to a stable hash of its slug.
 */
export const TOPIC_HIGHLIGHTERS: Readonly<Record<string, TopicHighlighter>> = {
  // A2, in index order.
  "daily-routine": "sky",
  directions: "lilac",
  family: "pink",
  food: "orange",
  "free-time": "green",
  health: "sky",
  home: "orange",
  shopping: "pink",
  weather: "sky",
  work: "lilac",
  // B1, in index order.
  "city-life": "lilac",
  "culture-and-entertainment": "pink",
  education: "sky",
  environment: "green",
  "health-and-lifestyle": "orange",
  "media-and-news": "lilac",
  "money-and-shopping": "green",
  relationships: "pink",
  technology: "sky",
  travel: "orange",
  "work-and-careers": "lilac",
};

/** djb2: a small stable string hash. */
function hash(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h;
}

/** The topic's highlighter (never yellow). */
export function topicHighlighter(topic: string): TopicHighlighter {
  return TOPIC_HIGHLIGHTERS[topic] ?? TOPIC_PALETTE[hash(topic) % TOPIC_PALETTE.length] ?? "sky";
}

const LEVEL_HIGHLIGHTERS: Readonly<Record<Level, TopicHighlighter>> = {
  A1: "green",
  A2: "sky",
  B1: "lilac",
  B2: "orange",
  C1: "pink",
};

/** Each CEFR level's highlighter (placement result). */
export function levelHighlighter(level: Level): TopicHighlighter {
  return LEVEL_HIGHLIGHTERS[level];
}

const STICKY_NOTE_PALETTE = ["pink", "green", "orange", "sky"] as const;

/** The review sticky note's paper: a different color each day, the same all day long. */
export function stickyNoteHighlighter(day: LocalDate | string): TopicHighlighter {
  const days = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  const index =
    ((days % STICKY_NOTE_PALETTE.length) + STICKY_NOTE_PALETTE.length) % STICKY_NOTE_PALETTE.length;
  return STICKY_NOTE_PALETTE[index] ?? "pink";
}

/** Exercise id → topic of the (first) lesson that contains it. */
export function topicByExerciseId(content: Corpus): ReadonlyMap<string, string> {
  const topics = new Map<string, string>();
  for (const lesson of content.lessons) {
    for (const id of lesson.exerciseIds) if (!topics.has(id)) topics.set(id, lesson.topic);
  }
  return topics;
}

/** Item id → topic of the (first) lesson that practices it. */
export function topicByItemId(content: Corpus): ReadonlyMap<string, string> {
  const topics = new Map<string, string>();
  for (const [exerciseId, topic] of topicByExerciseId(content)) {
    for (const itemId of content.exercisesById.get(exerciseId)?.itemIds ?? []) {
      if (!topics.has(itemId)) topics.set(itemId, topic);
    }
  }
  return topics;
}
