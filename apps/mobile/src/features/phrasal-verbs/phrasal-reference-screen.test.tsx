import { fireEvent, render, screen } from "@testing-library/react-native";
import { PhrasalReferenceScreen } from "./phrasal-reference-screen";

it("opens a topic, shows translations and examples, and returns to the topic list", async () => {
  await render(<PhrasalReferenceScreen />);
  expect(screen.getByRole("header", { name: "Phrasal verbs" })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Casa y rutina" }));
  expect(screen.getByText("clean (something) up")).toBeOnTheScreen();
  expect(screen.getByText("ordenar, limpiar")).toBeOnTheScreen();
  expect(screen.getByText("Please clean up your room before dinner.")).toBeOnTheScreen();
  expect(screen.getByText("Por favor, ordena tu cuarto antes de la cena.")).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Ver todos los temas" }));
  expect(screen.queryByText("Please clean up your room before dinner.")).toBeNull();
  expect(screen.getByRole("button", { name: "Casa y rutina" })).toBeOnTheScreen();
});
