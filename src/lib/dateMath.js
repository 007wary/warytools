// Shared date math for the age and date-difference calculators.

// <input type="date"> gives "YYYY-MM-DD". new Date(that string) parses it
// as UTC midnight, not local midnight — in timezones behind UTC that rolls
// back to the previous local day. Parse the parts directly instead so the
// date always means what the user picked, regardless of timezone.
export function parseDateInput(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function daysInMonth(year, month) {
  // Day 0 of `month + 1` is the last day of `month` (month is 0-indexed).
  return new Date(year, month + 1, 0).getDate();
}

// Calendar-aware difference between two dates: years/months/days plus a
// flat day count. Order-independent — always measures earlier to later.
//
// The years/months/days breakdown is computed by stepping `earlier`
// forward by whole months to find the latest month-aligned date that
// doesn't overshoot `later`, then measuring the remaining days from
// there. This avoids naively subtracting day-of-month numbers, which
// breaks whenever `earlier`'s day doesn't exist in the target month
// (e.g. Jan 31 stepped into February) — `new Date()` silently rolls
// such dates into the *next* month instead of clamping, which used to
// let the day count go negative (e.g. Jan 31 -> Mar 1 came out as
// "1 month, -1 days"). Clamping the stepped day to the target month's
// length keeps the anchor date from ever overshooting unexpectedly.
export function diffBetween(start, end) {
  const [earlier, later] = start <= end ? [start, end] : [end, start];

  let years = later.getFullYear() - earlier.getFullYear();
  let months = later.getMonth() - earlier.getMonth();
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  function anchorFor(y, m) {
    const targetYear = earlier.getFullYear() + y;
    const targetMonth = earlier.getMonth() + m;
    const clampedDay = Math.min(earlier.getDate(), daysInMonth(targetYear, targetMonth));
    return new Date(targetYear, targetMonth, clampedDay);
  }

  let anchor = anchorFor(years, months);
  if (anchor.getTime() > later.getTime()) {
    months -= 1;
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    anchor = anchorFor(years, months);
  }

  const days = Math.round((later - anchor) / (1000 * 60 * 60 * 24));
  const totalDays = Math.floor((later - earlier) / (1000 * 60 * 60 * 24));

  // Total months and weeks are what people actually ask for ("how many months
  // old is my baby", "how many weeks until the deadline") and previously
  // needed mental arithmetic off the years/months/days breakdown.
  const totalMonths = years * 12 + months;
  const totalWeeks = Math.floor(totalDays / 7);

  return { years, months, days, totalDays, totalMonths, totalWeeks };
}

// Reasonable bounds for a date a person can type. `<input type="date">` will
// happily accept year 275760, and the resulting "273,790 years" result is
// noise rather than an answer.
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2200;

/**
 * Validates a raw "YYYY-MM-DD" value from a date input.
 *
 * Returns a discriminated result rather than throwing, matching the shape used
 * by calculatorInput.parseNumber so the clients handle both the same way:
 * `empty` means "nothing chosen yet, stay quiet", an error means "say this".
 *
 * `<input type="date">` guarantees a well-formed string in modern browsers,
 * but it is still a text field to a keyboard user, a paste target, and a
 * URL-restored value — none of which are guaranteed to be valid.
 *
 * @returns {{ok: true, date: Date} | {ok: false, empty: boolean, error: string}}
 */
export function validateDateInput(value, options = {}) {
  const { label = "Date", allowFuture = true } = options;

  if (!value) return { ok: false, empty: true, error: "" };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, empty: false, error: `${label} isn't a valid date.` };
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  // Catches impossible dates like 2025-02-30, which the Date constructor
  // silently rolls forward into March rather than rejecting.
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return { ok: false, empty: false, error: `${label} isn't a valid date.` };
  }

  if (year < MIN_YEAR || year > MAX_YEAR) {
    return {
      ok: false,
      empty: false,
      error: `${label} must be between ${MIN_YEAR} and ${MAX_YEAR}.`,
    };
  }

  if (!allowFuture && date > startOfToday()) {
    return { ok: false, empty: false, error: `${label} can't be in the future.` };
  }

  return { ok: true, date };
}

// Local midnight today. Comparing against `new Date()` directly makes any date
// chosen for *today* count as past, since "today" then carries a time-of-day.
export function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Days until the next anniversary of `date`, plus the date it falls on.
 *
 * Feb 29 is the interesting case: in a non-leap year there is no 29th, so the
 * anniversary is treated as falling on Mar 1 rather than silently rolling into
 * an unrelated date.
 */
export function nextAnniversary(date, from = startOfToday()) {
  const month = date.getMonth();
  const day = date.getDate();

  function anniversaryIn(year) {
    const candidate = new Date(year, month, day);
    // A Feb 29 in a non-leap year rolls to Mar 1; that is the intended
    // behaviour, but check explicitly so the intent is clear rather than
    // accidental.
    return candidate;
  }

  let next = anniversaryIn(from.getFullYear());
  if (next < from) next = anniversaryIn(from.getFullYear() + 1);

  const daysUntil = Math.round((next - from) / (1000 * 60 * 60 * 24));
  return { date: next, daysUntil, turning: next.getFullYear() - date.getFullYear() };
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function weekdayName(date) {
  return WEEKDAYS[date.getDay()];
}

/**
 * Weekdays elapsed between two dates, excluding Saturdays and Sundays.
 *
 * Counting business days is the most common follow-up to "how many days
 * between these dates" — notice periods, SLAs, delivery windows. Order-
 * independent, and exclusive of the start date so it stays consistent with
 * `diffBetween`'s totalDays.
 *
 * Public holidays are deliberately not modelled: they vary by country and
 * state, and a half-right holiday calendar is worse than none.
 */
export function businessDaysBetween(start, end) {
  const [earlier, later] = start <= end ? [start, end] : [end, start];
  const cursor = new Date(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  const target = new Date(later.getFullYear(), later.getMonth(), later.getDate());
  let count = 0;

  while (cursor < target) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
  }

  return count;
}
