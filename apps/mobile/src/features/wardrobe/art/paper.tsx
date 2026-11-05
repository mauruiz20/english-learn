import { Path } from "react-native-svg";
import type { AviArtProps, AviPaper } from "@/shared/ui/mascot";
import { PAPER_WHITE } from "./ink";

// Avi's paper: the body's fill, and for patterned paper the pattern, drawn on the whole 64×48
// grid and clipped to the body by Avi. Every fill is light (a highlighter or white), so Avi's
// dark face ink keeps its contrast in both schemes.

/** Graph-paper lines every 4 units (every 6, and bolder, on a small Avi). */
function gridPath(step: number): string {
  const lines: string[] = [];
  for (let x = step; x < 64; x += step) lines.push(`M${x} 0 V48`);
  for (let y = step; y < 48; y += step) lines.push(`M0 ${y} H64`);
  return lines.join(" ");
}

const GRID = gridPath(4);
const GRID_SMALL = gridPath(6);

function Grid({ highlighters, small }: AviArtProps) {
  return (
    <Path
      d={small ? GRID_SMALL : GRID}
      stroke={highlighters.sky}
      strokeWidth={small ? 1.1 : 0.7}
      opacity={0.85}
    />
  );
}

export const PAPERS: Readonly<Record<string, AviPaper>> = {
  "papel-cielo": { id: "papel-cielo", fill: ({ highlighters }) => highlighters.sky },
  "papel-menta": { id: "papel-menta", fill: ({ highlighters }) => highlighters.green },
  "papel-cuadriculado": { id: "papel-cuadriculado", fill: () => PAPER_WHITE, Pattern: Grid },
};
