import type { ContentFile } from "../schema";

export interface ValidationError {
  /** Corpus-relative file path, e.g. `b1/travel.json`. */
  file: string;
  /** Location inside the file, e.g. `exercises[2].answerIndex`. */
  path: string;
  message: string;
}

export interface LoadedFile {
  /** Corpus-relative path using `/` separators; the first segment is the directory. */
  file: string;
  data: ContentFile;
}

export type Rule = (files: readonly LoadedFile[]) => ValidationError[];
