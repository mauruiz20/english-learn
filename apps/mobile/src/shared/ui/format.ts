/** "1 día", "2 días", "0 días". */
export function formatDays(days: number): string {
  return `${days} ${days === 1 ? "día" : "días"}`;
}
