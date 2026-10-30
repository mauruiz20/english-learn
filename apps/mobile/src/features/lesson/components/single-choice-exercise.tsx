import { useState, type ReactNode } from "react";
import type { ExerciseResponse } from "../model/response";
import { ChoiceList } from "./choice-list";
import { ExerciseLayout } from "./exercise-layout";

type SingleChoiceExerciseProps = {
  instruction: string;
  /** Accessible name of the options group. */
  label: string;
  children: ReactNode;
  options: readonly string[];
  /** The options that are right; marked once `reveal` is set. */
  correctOptions: readonly string[];
  disabled: boolean;
  reveal?: boolean | undefined;
  onSubmit: (response: ExerciseResponse) => void;
  submitLabel?: string | undefined;
  /** The options are English and their words can be looked up now. */
  lookupOptions?: boolean | undefined;
};

/** Pick one option, then check. Shared by vocab, cloze and translation choice. */
export function SingleChoiceExercise({
  instruction,
  label,
  children,
  options,
  correctOptions,
  disabled,
  reveal = false,
  onSubmit,
  submitLabel,
  lookupOptions,
}: SingleChoiceExerciseProps) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <ExerciseLayout
      instruction={instruction}
      canSubmit={!disabled && selected !== null}
      locked={disabled}
      submitLabel={submitLabel}
      onSubmit={() => selected !== null && onSubmit({ kind: "choice", option: selected })}
    >
      {children}
      <ChoiceList
        label={label}
        options={options}
        selected={selected}
        disabled={disabled}
        onSelect={setSelected}
        correctOptions={reveal ? correctOptions : undefined}
        lookup={lookupOptions}
      />
    </ExerciseLayout>
  );
}
