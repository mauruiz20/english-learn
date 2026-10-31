import { act, render, screen } from "@testing-library/react-native";
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

describe("SessionSummary", () => {
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
      expect(screen.getByText("1", { includeHiddenElements: true })).toBeOnTheScreen();
      await act(async () => jest.advanceTimersByTime(STREAK_SOUND_DELAY_MS + 400));
      expect(screen.queryByText("1", { includeHiddenElements: true })).not.toBeOnTheScreen();
      expect(screen.getByText("2", { includeHiddenElements: true })).toBeOnTheScreen();
    });

    it("does not roll a streak that did not grow", async () => {
      await render(<SessionSummary {...base} streakIncreased={false} />);

      expect(screen.getByText("Racha: 2 días")).toBeOnTheScreen();
    });
  });
});
