/** CEFR levels covered by the app, in ascending order. */
export const LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;

export type Level = (typeof LEVELS)[number];
