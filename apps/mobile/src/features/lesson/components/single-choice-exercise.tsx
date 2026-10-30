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
  disabled: boolean;
  onSubmit: (response: ExerciseResponse) => void;
};

/** Pick one option, then check. Shared by vocab, cloze and translation choice. */
export function SingleChoiceExercise({
  instruction,
  label,
  children,
  options,
  disabled,
  onSubmit,
}: SingleChoiceExerciseProps) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <ExerciseLayout
      instruction={instruction}
      canSubmit={!disabled && selected !== null}
      onSubmit={() => selected !== null && onSubmit({ kind: "choice", option: selected })}
    >
      {children}
      <ChoiceList
        label={label}
        options={options}
        selected={selected}
        disabled={disabled}
        onSelect={setSelected}
      />
    </ExerciseLayout>
  );
}
