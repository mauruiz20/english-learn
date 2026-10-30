/**
 * A calendar date without time or timezone, formatted `YYYY-MM-DD`.
 * Branded so arbitrary strings cannot be passed where a validated date is expected.
 */
export type LocalDate = string & { readonly __brand: "LocalDate" };

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isValidLocalDate(value: string): value is LocalDate {
  const match = PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** Validates and brands a `YYYY-MM-DD` string. Throws on invalid input. */
export function localDate(value: string): LocalDate {
  if (!isValidLocalDate(value)) throw new Error(`Invalid local date: "${value}"`);
  return value;
}

// Pure proleptic-Gregorian epoch-day conversion (H. Hinnant's civil algorithms).
// No `Date` involved, so there are no timezone, DST or two-digit-year pitfalls.
function toEpochDay(date: LocalDate): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const year = m <= 2 ? y - 1 : y;
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const dayOfYear = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

function fromEpochDay(epochDay: number): LocalDate {
  const z = epochDay + 719_468;
  const era = Math.floor(z / 146_097);
  const dayOfEra = z - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as LocalDate;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromEpochDay(toEpochDay(date) + Math.trunc(days));
}

/** Number of calendar days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: LocalDate, to: LocalDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function compareLocalDate(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
