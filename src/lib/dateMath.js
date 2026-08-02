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

  return { years, months, days, totalDays };
}
