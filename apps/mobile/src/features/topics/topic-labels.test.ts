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

  it("names the study cards' topics", () => {
    expect(topicLabel("grammar")).toBe("Gramática");
    expect(topicLabel("phrasal-verbs")).toBe("Phrasal verbs");
    expect(topicLabel("vocabulary")).toBe("Vocabulario");
  });

  it("falls back to the slug as words", () => {
    expect(topicLabel("space-travel")).toBe("Space travel");
  });
});
