import { buildGlossaryIndex, type GlossaryEntry } from "@english-learn/domain";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { GlossaryProvider } from "@/features/glossary/glossary-provider";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import {
  cloze,
  passage,
  reading,
  translateWrite,
  translationChoice,
  vocab,
  wordOrder,
} from "../model/fixtures";
import { prepareExercise, type PreparedExercise } from "../model/prepare-exercise";
import { AnswerFeedback } from "./answer-feedback";
import { ExerciseBody } from "./exercise-body";
import { testRandomBytes } from "@/testing/random-bytes";

/** One entry per English word of the fixtures (Spanish gloss = `es:<word>`). */
const WORDS = [
  "what",
  "does",
  "mean",
  "wake",
  "up",
  "i",
  "usually",
  "have",
  "eat",
  "do",
  "go",
  "breakfast",
  "at",
  "seven",
  "she",
  "goes",
  "to",
  "bed",
  "eleven",
  "my",
  "day",
  "six",
  "thirty",
  "work",
  "by",
  "bus",
  "time",
  "how",
  "car",
  "on",
  "foot",
];
const entry = (id: string, forms: readonly string[]): GlossaryEntry => ({
  id,
  headword: forms[0] ?? id,
  kind: forms.some((f) => f.includes(" ")) ? "phrase" : "word",
  forms,
  senses: [{ es: `es:${id}` }],
});
const INDEX = buildGlossaryIndex([
  ...WORDS.map((w) => entry(w, [w])),
  entry("wake-up", ["wake up"]),
]);

const services = () => ({
  progressRepository: createFakeRepository(),
  clock: { today: () => "2026-10-30" as never, nowMs: () => 0 },
  random: () => 0.5,
  randomBytes: testRandomBytes,
  deviceId: "test-device",
  settingsRepository: createFakeSettingsRepository({ lookupHintDismissed: true }),
  sounds: createFakeSoundPlayer(),
});

async function renderBody(prepared: PreparedExercise, answered: boolean) {
  await render(
    <AppServicesProvider services={services()}>
      <GlossaryProvider index={INDEX}>
        <ExerciseBody
          prepared={prepared}
          passage={passage}
          disabled={answered}
          reveal={answered}
          onSubmit={jest.fn()}
        />
      </GlossaryProvider>
    </AppServicesProvider>,
  );
}

const rng = () => 0.5;
const lookups = () =>
  screen
    .queryAllByRole("button")
    .map((b) => String(b.props.accessibilityLabel))
    .filter((label) => label.endsWith(", ver traducción"))
    .map((label) => label.replace(", ver traducción", ""));

describe("lookups in exercises", () => {
  it("vocab: locks the evaluated term until the answer is checked, never the Spanish options", async () => {
    const prepared = prepareExercise(vocab, rng);
    await renderBody(prepared, false);
    expect(lookups()).toEqual(["What", "does", "mean"]);

    await renderBody(prepared, true);
    expect(lookups()).toEqual(["What", "does", "wake up", "mean"]);
  });

  it("cloze: the sentence is free; the chips are locked until answered", async () => {
    const prepared = prepareExercise(cloze, rng);
    await renderBody(prepared, false);
    expect(lookups()).toEqual(["I", "usually", "breakfast", "at", "seven"]);

    await renderBody(prepared, true);
    expect(lookups()).toEqual(
      expect.arrayContaining(["I", "usually", "breakfast", "have", "do", "go"]),
    );
  });

  it("translation choice: the sentence is locked until answered", async () => {
    const prepared = prepareExercise(translationChoice, rng);
    await renderBody(prepared, false);
    expect(lookups()).toEqual([]);

    await renderBody(prepared, true);
    expect(lookups()).toEqual(["She", "goes", "to", "bed", "at", "eleven"]);
  });

  it("word order: the tokens are locked until answered", async () => {
    const prepared = prepareExercise(wordOrder, rng);
    await renderBody(prepared, false);
    expect(lookups()).toEqual([]);

    await renderBody(prepared, true);
    expect([...lookups()].sort()).toEqual(["I", "up", "usually", "wake"]);
  });

  it("translate write: nothing English is shown before answering", async () => {
    await renderBody(prepareExercise(translateWrite, rng), false);
    expect(lookups()).toEqual([]);
  });

  it("reading: the passage and questions are free; the options are locked until answered", async () => {
    const prepared = prepareExercise(reading, rng);
    await renderBody(prepared, false);
    const before = lookups();
    expect(before).toEqual(expect.arrayContaining(["My", "day", "wake up", "bus", "What", "time"]));
    expect(before).not.toContain("car");

    await renderBody(prepared, true);
    expect(lookups()).toEqual(expect.arrayContaining(["car", "foot"]));
  });

  it("shows a looked-up word's Spanish sense", async () => {
    await renderBody(prepareExercise(reading, rng), false);

    await fireEvent.press(screen.getByRole("button", { name: "bus, ver traducción" }));

    expect(screen.getByText("es:bus")).toBeOnTheScreen();
  });
});

describe("lookups in the feedback", () => {
  async function renderFeedback(lookupAnswer: boolean) {
    await render(
      <AppServicesProvider services={services()}>
        <GlossaryProvider index={INDEX}>
          <AnswerFeedback
            verdict="wrong"
            given="I go to bed"
            correctAnswer="I usually go to bed at eleven."
            lookupAnswer={lookupAnswer}
            onContinue={jest.fn()}
          />
        </GlossaryProvider>
      </AppServicesProvider>,
    );
  }

  it("lets the learner look up the English answer shown after checking", async () => {
    await renderFeedback(true);
    expect(lookups()).toEqual(["I", "usually", "go", "to", "bed", "at", "eleven"]);
  });

  it("does not link a Spanish answer", async () => {
    await renderFeedback(false);
    expect(lookups()).toEqual([]);
  });
});
