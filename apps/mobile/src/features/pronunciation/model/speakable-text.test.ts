import { speakableTerm } from "./speakable-text";

describe("speakableTerm", () => {
  it.each([
    ["wake up", "wake up"],
    ["clean (something) up", "clean up"],
    ["look forward to + -ing", "look forward to"],
    ["used to + infinitive", "used to"],
    ["get on / get off", "get on, get off"],
    ["a lot of [informal]", "a lot of"],
    ["  so   do I  ", "so do I"],
    ["the (+ adjective)", "the"],
  ])("%s → %s", (term, spoken) => {
    expect(speakableTerm(term)).toBe(spoken);
  });

  it("gives nothing to say for a pattern without words", () => {
    expect(speakableTerm("+ -ing")).toBe("");
  });
});
