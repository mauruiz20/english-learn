import type { GlossaryEntry } from "@english-learn/domain";
import { fireEvent, screen } from "@testing-library/react-native";
import { renderWithPronunciation } from "@/testing/render-with-pronunciation";
import { LookupCard } from "./lookup-card";

const entry: GlossaryEntry = {
  id: "glossary.wake-up",
  headword: "wake up",
  kind: "phrase",
  forms: ["wake up"],
  senses: [{ es: "despertarse", pos: "phrasal verb" }],
};

describe("LookupCard pronunciation", () => {
  it("offers to hear the headword when the card is a dialog", async () => {
    const { speech } = await renderWithPronunciation(<LookupCard entry={entry} speakable />);

    await fireEvent.press(screen.getByRole("button", { name: "Escuchar: wake up" }));

    expect(speech.spoken.map((s) => s.text)).toEqual(["wake up"]);
  });

  it("has no speaker on a hover tooltip (it cannot be pressed)", async () => {
    await renderWithPronunciation(<LookupCard entry={entry} />);
    expect(screen.queryByRole("button", { name: /Escuchar/u })).toBeNull();
  });
});
