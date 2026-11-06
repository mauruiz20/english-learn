import { corpus } from "@english-learn/content/corpus";
import { topicLabel } from "./topic-labels";

describe("topicLabel", () => {
  it("has a Spanish name for every topic with lessons", () => {
    const topics = new Set(corpus.lessons.map((lesson) => lesson.topic));
    for (const topic of topics) {
      expect(topicLabel(topic)).not.toMatch(/-/);
      expect(topicLabel(topic)).not.toBe(topic);
    }
  });

  it("names every topic with lessons by hand, never with the slug fallback", () => {
    const topics = new Set(corpus.lessons.map((lesson) => lesson.topic));
    const asWords = (slug: string) => {
      const words = slug.replace(/-/g, " ");
      return words.charAt(0).toUpperCase() + words.slice(1);
    };
    const unnamed = [...topics].filter((topic) => topicLabel(topic) === asWords(topic));
    expect(unnamed).toEqual([]);
  });

  it("names the B2 topics", () => {
    expect(topicLabel("work-and-leadership")).toBe("Trabajo y liderazgo");
    expect(topicLabel("media-and-misinformation")).toBe("Medios y desinformación");
  });

  it.each([
    ["greetings", "Saludos y presentaciones"],
    ["to-be-and-questions", "To be y preguntas"],
    ["numbers-and-age", "Números y edad"],
    ["my-family", "Mi familia"],
    ["colors-and-clothes", "Colores y ropa"],
    ["food-and-drinks", "Comidas y bebidas"],
    ["days-and-time", "Días y horas"],
    ["my-house", "Mi casa"],
  ])("names the A1 topic %s", (topic, label) => {
    expect(topicLabel(topic)).toBe(label);
  });

  // The C1 lessons are written apart from the app: their topics are named here ahead of time,
  // so that content needs no app change (see the app README, "Topic names and colors").
  it.each([
    ["arts-and-culture", "Arte y cultura"],
    ["global-issues", "Problemas globales"],
    ["language-and-communication", "Lenguaje y comunicación"],
    ["law-and-ethics", "Derecho y ética"],
    ["politics-and-media", "Política y medios"],
    ["psychology-and-behaviour", "Psicología y conducta"],
    ["science-and-society", "Ciencia y sociedad"],
    ["work-and-negotiation", "Trabajo y negociación"],
  ])("names the C1 topic %s", (topic, label) => {
    expect(topicLabel(topic)).toBe(label);
  });

  it("names the study cards' topics", () => {
    expect(topicLabel("grammar")).toBe("Gramática");
    expect(topicLabel("phrasal-verbs")).toBe("Phrasal verbs");
    expect(topicLabel("vocabulary")).toBe("Vocabulario");
  });

  it("falls back to the slug as words", () => {
    expect(topicLabel("space-travel")).toBe("Space travel");
  });
});
