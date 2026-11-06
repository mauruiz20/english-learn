import { dailyGoalStatus } from "@english-learn/domain";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { DailyGoalMeter } from "./daily-goal-meter";
import { DailyGoalPrompt } from "./daily-goal-prompt";

beforeEach(() => jest.clearAllMocks());

describe("DailyGoalMeter", () => {
  it("shows today's count against the goal with a full spoken label", async () => {
    await render(
      <DailyGoalMeter goal="normal" status={dailyGoalStatus("normal", 12)} onChoose={jest.fn()} />,
    );

    expect(screen.getByText("12 / 20 hoy")).toBeOnTheScreen();
    const meter = screen.getByRole("progressbar", {
      name: "Meta diaria: 12 de 20 ejercicios hoy",
    });
    expect(meter.props.accessibilityValue).toEqual({ min: 0, max: 20, now: 12 });
    expect(screen.queryByText("¡Meta cumplida!")).toBeNull();
    expect(screen.queryByTestId("daily-goal-sticker", { includeHiddenElements: true })).toBeNull();
  });

  it("celebrates a met goal with a sticker", async () => {
    await render(
      <DailyGoalMeter goal="light" status={dailyGoalStatus("light", 13)} onChoose={jest.fn()} />,
    );

    expect(screen.getByText("¡Meta cumplida!")).toBeOnTheScreen();
    expect(
      screen.getByRole("progressbar", { name: "¡Meta cumplida! 13 de 10 ejercicios hoy" }).props
        .accessibilityValue,
    ).toEqual({ min: 0, max: 10, now: 10 });
    expect(
      screen.getByTestId("daily-goal-sticker", { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  });

  it("hides the count without a goal, keeping the way to pick one", async () => {
    await render(
      <DailyGoalMeter goal="off" status={dailyGoalStatus("off", 12)} onChoose={jest.fn()} />,
    );

    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/hoy/)).toBeNull();
    expect(screen.getByRole("button", { name: "Meta diaria: Sin meta" })).toBeOnTheScreen();
  });

  it("opens the goals as radios under the chip and closes once one is picked", async () => {
    const onChoose = jest.fn();
    await render(
      <DailyGoalMeter goal="normal" status={dailyGoalStatus("normal", 3)} onChoose={onChoose} />,
    );
    const chip = screen.getByRole("button", { name: "Meta diaria: Normal · 20" });
    expect(chip.props.accessibilityState).toMatchObject({ expanded: false });
    expect(StyleSheet.flatten(chip.props.style).minHeight).toBeGreaterThanOrEqual(44);

    await fireEvent.press(chip);

    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.props.accessibilityLabel)).toEqual([
      "Suave · 10",
      "Normal · 20",
      "Intensa · 40",
      "Sin meta",
    ]);
    expect(screen.getByRole("radio", { name: "Normal · 20" }).props.accessibilityState).toEqual({
      checked: true,
      disabled: false,
    });

    await fireEvent.press(screen.getByRole("radio", { name: "Intensa · 40" }));

    expect(onChoose).toHaveBeenCalledWith("intense");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });
});

describe("DailyGoalPrompt", () => {
  it("offers every goal without blocking, and picking one answers it", async () => {
    const onChoose = jest.fn();
    const onDismiss = jest.fn();
    await render(<DailyGoalPrompt onChoose={onChoose} onDismiss={onDismiss} />);

    expect(screen.getByText("¿Cuánto quieres practicar cada día?")).toBeOnTheScreen();
    for (const label of ["Suave · 10", "Normal · 20", "Intensa · 40", "Sin meta"]) {
      const option = screen.getByRole("button", { name: label });
      expect(StyleSheet.flatten(option.props.style).minHeight).toBeGreaterThanOrEqual(44);
    }

    await fireEvent.press(screen.getByRole("button", { name: "Suave · 10" }));

    expect(onChoose).toHaveBeenCalledWith("light");
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("can be closed, keeping the default goal", async () => {
    const onChoose = jest.fn();
    const onDismiss = jest.fn();
    await render(<DailyGoalPrompt onChoose={onChoose} onDismiss={onDismiss} />);

    await fireEvent.press(screen.getByRole("button", { name: "Ahora no" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
  });
});
