import { render, screen } from "@testing-library/react-native";
import { corpus } from "@english-learn/content/corpus";
import { phrasalReference } from "./model/phrasal-reference";
import { PhrasalReferenceScreen } from "./phrasal-reference-screen";

it("shows every entry in one list with a heading separating each topic, without topic selection", async () => {
  await render(<PhrasalReferenceScreen />);
  expect(screen.getByRole("header", { name: "Phrasal verbs" })).toBeOnTheScreen();
  for (const group of phrasalReference(corpus)) {
    expect(screen.getByRole("header", { name: group.title })).toBeOnTheScreen();
    for (const entry of group.entries) {
      expect(screen.getAllByText(entry.verb).length).toBeGreaterThan(0);
      expect(screen.getAllByText(entry.es).length).toBeGreaterThan(0);
      expect(screen.getAllByText(entry.example.en).length).toBeGreaterThan(0);
      expect(screen.getAllByText(entry.example.es).length).toBeGreaterThan(0);
    }
  }
  expect(screen.queryByRole("button", { name: "Casa y rutina" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Ver todos los temas" })).toBeNull();
});
