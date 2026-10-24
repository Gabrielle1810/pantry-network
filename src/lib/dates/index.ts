// Dates module. The full Task 6 build adds toISO/parseISO, tz "today", and the
// property tests. This slice needs the ambiguity detection used by the
// server-side re-check (R5.13, R7.3, R7.4): after the AI returns a date, we
// re-parse date_raw and, if a numeric date is genuinely ambiguous, we refuse
// any AI auto-resolution and surface both candidates instead.
export const DATES_MODULE_READY = true as const;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Build an ISO date string from numeric parts (no validation of calendar range). */
export function toISO(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Last day of a given month (1-12) in a year, accounting for leap years. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Normalize a 2-digit year to 4 digits (assume 2000s for freshness dates). */
function normalizeYear(raw: number): number {
  if (raw >= 100) return raw;
  return 2000 + raw;
}

export interface AmbiguityResult {
  /** True when the numeric date reads two valid ways (month-first vs day-first). */
  ambiguous: boolean;
  /** ISO candidates. When ambiguous: [monthFirstISO, dayFirstISO] (R7.4). */
  candidates: string[];
  precision: "day" | "month" | null;
}

// Matches three numeric groups separated by / - or . (e.g. 06/12/27, 6-12-2027).
const NUMERIC_DMY = /^\s*(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})\s*$/;
// Matches month/year only (e.g. 06/2027), with an optional day-less separator.
const NUMERIC_MY = /^\s*(\d{1,2})[/\-.](\d{4})\s*$/;

/**
 * Detect whether a raw printed date reads ambiguously. Only decides the
 * month-first vs day-first case for a two-small-components numeric date
 * (R7.3); it does not try to parse every textual date form (that is Task 6).
 *
 * - Numeric D/M/Y where the first two components are both 1..12 and differ →
 *   ambiguous, candidates [monthFirstISO, dayFirstISO] (R7.4), never resolved.
 * - Month/Year only → last day of month, precision "month" (R7.5).
 * - Otherwise → not ambiguous here (candidates empty).
 */
export function detectAmbiguity(raw: string | null | undefined): AmbiguityResult {
  const notAmbiguous: AmbiguityResult = { ambiguous: false, candidates: [], precision: null };
  if (!raw) return notAmbiguous;

  const trimmed = raw.trim();

  const dmy = trimmed.match(NUMERIC_DMY);
  if (dmy) {
    const a = Number(dmy[1]); // could be month or day
    const b = Number(dmy[2]); // could be day or month
    const year = normalizeYear(Number(dmy[3]));
    // Ambiguous only when both leading components are valid month values and differ.
    if (a >= 1 && a <= 12 && b >= 1 && b <= 12 && a !== b) {
      const monthFirst = toISO(year, a, b); // a=month, b=day
      const dayFirst = toISO(year, b, a); // b=month, a=day
      return { ambiguous: true, candidates: [monthFirst, dayFirst], precision: "day" };
    }
    return notAmbiguous;
  }

  const my = trimmed.match(NUMERIC_MY);
  if (my) {
    const month = Number(my[1]);
    const year = normalizeYear(Number(my[2]));
    if (month >= 1 && month <= 12) {
      return {
        ambiguous: false,
        candidates: [toISO(year, month, lastDayOfMonth(year, month))],
        precision: "month",
      };
    }
  }

  return notAmbiguous;
}

/**
 * Today's date as an ISO "YYYY-MM-DD" string in the given IANA time zone
 * (R7.7). Uses Intl so it never drifts to UTC. Defaults to CAMPUS_TZ env or
 * America/New_York. A clock can be injected for deterministic tests.
 */
export function todayInTz(
  tz: string = process.env.CAMPUS_TZ ?? "America/New_York",
  now: Date = new Date(),
): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the ISO date we want.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // already "YYYY-MM-DD"
}

/**
 * Whole days from `todayIso` until `iso` (both "YYYY-MM-DD"). Positive when the
 * target is in the future, 0 for today, negative when past. Computed on the
 * calendar date only (no time-of-day), using UTC midnight to avoid DST drift.
 */
export function daysUntil(iso: string, todayIso: string): number {
  const a = Date.parse(`${todayIso}T00:00:00Z`);
  const b = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

/** Spell out an ISO date as a human label, e.g. "2027-06-12" → "12 June 2027". */
export function spellOut(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const monthName = MONTHS[month - 1] ?? String(month);
  return `${day} ${monthName} ${year}`;
}
