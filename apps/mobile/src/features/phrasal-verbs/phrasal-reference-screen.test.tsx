import { fireEvent, render, screen } from "@testing-library/react-native";
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

it("searches English verbs and Spanish meanings, ignores case/accents, and clears back to the full list", async () => {
  await render(<PhrasalReferenceScreen />);
  const input = screen.getByLabelText("Buscar phrasal verbs");
  await fireEvent.changeText(input, "  CLEAN UP  ");
  expect(screen.getByText("clean (something) up")).toBeOnTheScreen();
  expect(screen.queryByText("wake up")).toBeNull();
  expect(screen.getByRole("header", { name: "Casa y rutina" })).toBeOnTheScreen();
  expect(screen.queryByRole("header", { name: "Viajes" })).toBeNull();
  await fireEvent.changeText(input, "LIMPIAR");
  expect(screen.getByText("clean (something) up")).toBeOnTheScreen();
  const accented = phrasalReference(corpus)
    .flatMap((group) => group.entries)
    .find((entry) => /[áéíóú]/.test(entry.es));
  if (!accented) throw new Error("Expected an accented Spanish meaning");
  await fireEvent.changeText(
    input,
    accented.es.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase(),
  );
  expect(screen.getAllByText(accented.verb).length).toBeGreaterThan(0);
  await fireEvent.changeText(input, "zz-no-match-zz");
  expect(screen.getByText("No encontramos phrasal verbs con esa búsqueda.")).toBeOnTheScreen();
  expect(screen.getByText("0 entradas · 0 temas")).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Limpiar búsqueda" }));
  expect(screen.getByText("110 entradas · 20 temas")).toBeOnTheScreen();
  expect(screen.getByText("wake up")).toBeOnTheScreen();
});
