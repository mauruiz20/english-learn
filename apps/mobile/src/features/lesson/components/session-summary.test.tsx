import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { withMotion } from "@/testing/motion";
import { STREAK_SOUND_DELAY_MS } from "../use-session-sounds";
import { SessionSummary } from "./session-screens";

const base = {
  title: "¡Lección completada!",
  correct: 6,
  total: 6,
  xpEarned: 80,
  streakDays: 2,
  streakIncreased: true,
  toReview: [],
  onGoHome: jest.fn(),
};

const stamp = () => screen.queryByRole("image", { name: "Sello: ¡Excelente!" });

const recap = [
  {
    id: "a2.daily-routine.wake-up",
    term: "wake up",
    es: "despertarse",
    card: { id: "a2.phrasal-verbs.daily-routine", title: "Phrasal verbs de la rutina" },
  },
  {
    id: "a2.daily-routine.usually",
    term: "usually",
    es: "normalmente",
    example: { en: "I usually wake up at six.", es: "Normalmente me despierto a las seis." },
  },
];

describe("SessionSummary", () => {
  describe("Lo nuevo de hoy", () => {
    it("lists the lesson's new items: a card link, or the meaning and an example", async () => {
      const onOpenCard = jest.fn();
      await render(<SessionSummary {...base} recap={recap} onOpenCard={onOpenCard} />);

      const section = screen.getByTestId("summary-recap");
      expect(within(section).getByRole("header", { name: "Lo nuevo de hoy" })).toBeOnTheScreen();
      expect(within(section).getByText("despertarse")).toBeOnTheScreen();
      expect(within(section).getByText("normalmente")).toBeOnTheScreen();
      expect(within(section).getByText("I usually wake up at six.")).toBeOnTheScreen();
      expect(within(section).getByText("Normalmente me despierto a las seis.")).toBeOnTheScreen();

      fireEvent.press(
        within(section).getByRole("button", { name: "Ver ficha: Phrasal verbs de la rutina" }),
      );
      expect(onOpenCard).toHaveBeenCalledWith("a2.phrasal-verbs.daily-routine");
    });

    it("shows the meaning but no card link when cards cannot be opened", async () => {
      await render(<SessionSummary {...base} recap={recap} />);

      expect(screen.getByText("despertarse")).toBeOnTheScreen();
      expect(screen.queryByRole("button", { name: /^Ver ficha/ })).not.toBeOnTheScreen();
    });

    it("is absent without new items (a review, a card practice)", async () => {
      await render(<SessionSummary {...base} />);

      expect(screen.queryByTestId("summary-recap")).not.toBeOnTheScreen();
    });
  });

  describe("redo", () => {
    it("offers to repeat a lesson with mistakes, aiming for all correct", async () => {
      const onRedo = jest.fn();
      await render(<SessionSummary {...base} correct={4} onRedo={onRedo} />);

      const redo = screen.getByRole("button", { name: "Repetir lección" });
      expect(redo.props.accessibilityHint).toBe("Vuelve a hacer la lección para sacar todo bien");
      fireEvent.press(redo);
      expect(onRedo).toHaveBeenCalledTimes(1);
    });

    it("still lets the learner repeat a perfect lesson, as a quieter option", async () => {
      await render(<SessionSummary {...base} onRedo={jest.fn()} />);

      expect(screen.getByRole("button", { name: "Repetir lección" })).toBeOnTheScreen();
    });

    it("is not offered without onRedo", async () => {
      await render(<SessionSummary {...base} correct={4} />);

      expect(screen.queryByRole("button", { name: "Repetir lección" })).not.toBeOnTheScreen();
    });
  });

  describe("the perfect-page stamp", () => {
    it("stamps a page with every answer right", async () => {
      await render(<SessionSummary {...base} />);

      expect(stamp()).toBeOnTheScreen();
    });

    it("never stamps a page with a mistake", async () => {
      await render(<SessionSummary {...base} correct={5} />);

      expect(stamp()).not.toBeOnTheScreen();
    });

    it("never stamps an empty session", async () => {
      await render(<SessionSummary {...base} correct={0} total={0} />);

      expect(stamp()).not.toBeOnTheScreen();
    });
  });

  it("shows the results without any currency row (plumas were withdrawn)", async () => {
    await render(<SessionSummary {...base} />);

    expect(screen.queryByTestId("summary-plumas")).not.toBeOnTheScreen();
    expect(screen.queryByText(/Plumas/)).not.toBeOnTheScreen();
  });

  describe("with reduced motion", () => {
    it("shows the final XP and streak at once", async () => {
      await render(<SessionSummary {...base} />);

      expect(screen.getByText("XP ganada: 80")).toBeOnTheScreen();
      expect(screen.getByText("Racha: 2 días")).toBeOnTheScreen();
    });
  });

  describe("with motion", () => {
    beforeEach(() => {
      withMotion();
      jest.useFakeTimers();
    });
    afterEach(() => jest.useRealTimers());

    it("counts the XP up from 0 to what was earned", async () => {
      await render(<SessionSummary {...base} />);

      expect(screen.getByText("XP ganada: 0")).toBeOnTheScreen();
      await act(async () => jest.advanceTimersByTime(2000));
      expect(screen.getByText("XP ganada: 80")).toBeOnTheScreen();
    });

    it("rolls a grown streak from the old number to the new one, with the streak sound", async () => {
      await render(<SessionSummary {...base} />);

      // Screen readers get the final value from the start.
      expect(screen.getByLabelText("Racha: 2 días")).toBeOnTheScreen();
      // Each line of the drum carries its own plural: "1 día" rolls up to "2 días".
      expect(screen.getByText("1 día", { includeHiddenElements: true })).toBeOnTheScreen();
      expect(screen.getByText("2 días", { includeHiddenElements: true })).toBeOnTheScreen();
      expect(screen.queryByText(/^1 días|^2 día$/, { includeHiddenElements: true })).toBeNull();
      await act(async () => jest.advanceTimersByTime(STREAK_SOUND_DELAY_MS + 400));
      expect(screen.queryByText("1 día", { includeHiddenElements: true })).not.toBeOnTheScreen();
      expect(screen.getByText("2 días", { includeHiddenElements: true })).toBeOnTheScreen();
    });

    it("never shows 0 días for a streak that starts today: it appears at 1 día", async () => {
      await render(<SessionSummary {...base} streakDays={1} />);

      expect(screen.getByText("Racha: 1 día")).toBeOnTheScreen();
      expect(screen.queryByText(/\b0 días?\b/, { includeHiddenElements: true })).toBeNull();
    });

    it("does not roll a streak that did not grow", async () => {
      await render(<SessionSummary {...base} streakIncreased={false} />);

      expect(screen.getByText("Racha: 2 días")).toBeOnTheScreen();
    });
  });

  describe("the celebration", () => {
    it("sticks the lesson's sticker on the page, with Avi cheering", async () => {
      await render(<SessionSummary {...base} topic="daily-routine" />);

      expect(screen.getByTestId("summary-sticker", { includeHiddenElements: true })).toBeTruthy();
      expect(screen.getByTestId("avi-cheer", { includeHiddenElements: true })).toBeTruthy();
    });

    it("throws no confetti with reduced motion", async () => {
      await render(<SessionSummary {...base} />);

      expect(screen.queryByTestId("confetti", { includeHiddenElements: true })).toBeNull();
    });

    it("throws confetti over a finished session otherwise", async () => {
      withMotion();
      await render(<SessionSummary {...base} />);

      expect(screen.getByTestId("confetti", { includeHiddenElements: true })).toBeTruthy();
    });

    it("lets the stamp speak on a perfect page, beside Avi", async () => {
      await render(<SessionSummary {...base} />);

      expect(stamp()).toBeOnTheScreen();
      expect(screen.queryByText("¡Perfecto!")).not.toBeOnTheScreen();
    });

    it.each([
      [5, 6, "¡Muy bien!"],
      [3, 6, "¡Bien hecho!"],
      [1, 6, "¡A seguir practicando!"],
    ])("cheers %i of %i right with %p", async (correct, total, cheer) => {
      await render(<SessionSummary {...base} correct={correct} total={total} />);

      expect(screen.getByText(cheer)).toBeOnTheScreen();
    });

    it("hooks a new clip onto the streak chain", async () => {
      await render(<SessionSummary {...base} streakDays={3} />);

      expect(screen.getAllByTestId("clip", { includeHiddenElements: true })).toHaveLength(3);
    });
  });

  describe("new stickers for the album", () => {
    const earned = [
      { id: "first-lesson", title: "Primer sticker", color: "green" },
      { id: "xp-100", title: "100 XP", color: "orange" },
    ] as const;

    it("announces each sticker the session earned", async () => {
      await render(<SessionSummary {...base} achievements={earned} />);

      expect(screen.getByText("Primer sticker")).toBeOnTheScreen();
      expect(screen.getByText("100 XP")).toBeOnTheScreen();
      expect(screen.getAllByText("Nueva insignia para tu álbum")).toHaveLength(2);
    });

    it("says nothing about the album when nothing was earned", async () => {
      await render(<SessionSummary {...base} />);

      expect(screen.queryByText("Nueva insignia para tu álbum")).not.toBeOnTheScreen();
    });
  });
});
