import { fireEvent, render, screen } from "@testing-library/react-native";
import { practiceContent } from "./model/fixtures";
import { practiceCollectionRows, practiceGroupRows } from "./model/practice-catalog";
import { PracticeCollectionView } from "./practice-collection-view";
import { PracticeView, practiceCount } from "./practice-view";

const onOpen = jest.fn();
const collection = practiceContent.practice[0]!;
const HOME_1 = "a2.phrasal-verbs.practice-home-1";
const HOME_2 = "a2.phrasal-verbs.practice-home-2";

beforeEach(() => jest.clearAllMocks());

describe("practiceCount", () => {
  it("says how many groups and lessons, and how many are done", () => {
    expect(practiceCount({ groups: 10, lessons: 30, done: 0 })).toBe("10 grupos · 30 lecciones");
    expect(practiceCount({ groups: 1, lessons: 3, done: 1 })).toBe(
      "1 grupo · 3 lecciones · 1 hecha",
    );
    expect(practiceCount({ groups: 2, lessons: 6, done: 2 })).toBe(
      "2 grupos · 6 lecciones · 2 hechas",
    );
  });
});

describe("PracticeView", () => {
  it("shows a loading indicator, then an error if progress cannot load", async () => {
    await render(<PracticeView state={{ status: "loading" }} onOpenCollection={onOpen} />);
    expect(screen.getByLabelText("Cargando la práctica libre")).toBeOnTheScreen();

    await render(<PracticeView state={{ status: "error" }} onOpenCollection={onOpen} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar tu progreso.");
  });

  it("lists the collections, separate from the path, and opens one", async () => {
    const collections = practiceCollectionRows(practiceContent, [
      { lessonId: HOME_1, bestAccuracy: 1, completions: 1 },
    ]);
    await render(
      <PracticeView state={{ status: "ready", collections }} onOpenCollection={onOpen} />,
    );

    expect(screen.getByRole("header", { name: "Práctica libre" })).toBeOnTheScreen();
    expect(screen.getByText(/no cambia tu camino de lecciones/)).toBeOnTheScreen();
    const row = screen.getByRole("button", {
      name: "Phrasal verbs: 1 grupo, 2 lecciones, 1 hecha",
    });
    await fireEvent.press(row);
    expect(onOpen).toHaveBeenCalledWith("phrasal-verbs");
  });
});

describe("PracticeCollectionView", () => {
  it("says when the collection does not exist", async () => {
    await render(<PracticeCollectionView state={{ status: "not-found" }} onOpenLesson={onOpen} />);
    expect(screen.getByText("No encontramos este tema de práctica.")).toBeOnTheScreen();
  });

  it("shows every group with its level label, verbs and open lessons", async () => {
    const groups = practiceGroupRows(collection, practiceContent, []);
    await render(
      <PracticeCollectionView
        state={{ status: "ready", title: "Phrasal verbs", summary: "Por tema.", groups }}
        onOpenLesson={onOpen}
      />,
    );

    expect(screen.getByRole("header", { name: "Phrasal verbs" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Casa y rutina, nivel A2" })).toBeOnTheScreen();
    expect(screen.getByText("wake up · breakfast · usually")).toBeOnTheScreen();
    // Nothing is locked: every lesson is a button, marked new until it is done.
    const first = screen.getByRole("button", { name: "Casa y rutina: conócelos, nueva" });
    expect(first.props.accessibilityState?.disabled).not.toBe(true);
    expect(screen.getAllByText("Nueva")).toHaveLength(2);
    await fireEvent.press(first);
    expect(onOpen).toHaveBeenCalledWith(HOME_1);
  });

  it("marks each done lesson with its best result, like the path", async () => {
    const groups = practiceGroupRows(collection, practiceContent, [
      { lessonId: HOME_1, bestAccuracy: 1, completions: 1 },
      { lessonId: HOME_2, bestAccuracy: 0.75, completions: 1 },
    ]);
    await render(
      <PracticeCollectionView
        state={{ status: "ready", title: "Phrasal verbs", summary: "Por tema.", groups }}
        onOpenLesson={onOpen}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Casa y rutina: conócelos, completada sin errores: 6 de 6 correctas",
      }),
    ).toBeOnTheScreen();
    expect(screen.getByText("Perfecta · 6/6")).toBeOnTheScreen();
    expect(
      screen.getByTestId(`practice-perfect-${HOME_1}`, { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(screen.getByText("Completada · 3/4")).toBeOnTheScreen();
    expect(
      screen.getByRole("button", {
        name: "Casa y rutina: practícalos, completada con errores: 3 de 4 correctas",
      }).props.accessibilityHint,
    ).toBe("Repítela para sacar todo bien");
    expect(screen.queryByText("Nueva")).toBeNull();
  });
});
