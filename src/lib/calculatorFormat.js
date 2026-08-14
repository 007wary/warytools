// Number and currency formatting shared by every calculator.
//
// Before this module each calculator formatted its own way and each was wrong
// in a different direction:
//
//   - The unit converter used toLocaleString({ maximumFractionDigits: 6 }),
//     which renders a real 0.0000001 mg result as a flat "0" and leaks float
//     artifacts like "4.828032000000001" for values just inside that window.
//   - The interest calculator used toFixed(2) with no grouping and no currency
//     symbol, so a lakh rendered as "1234567.89".
//   - The GST calculator hardcoded "₹" with toFixed(2) — right symbol, wrong
//     grouping (Indian digit grouping is 12,34,567 not 1,234,567).
//   - The percentage calculator interpolated the raw parsed number straight
//     into its result sentence, unformatted.
//
// Everything now goes through Intl.NumberFormat, which handles locale grouping
// and rounding correctly, and is cached because constructing a formatter is
// comparatively expensive and these run on every keystroke.

const formatterCache = new Map();

function getFormatter(locale, options) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    formatterCache.set(key, formatter);
  }
  return formatter;
}

// GST is an Indian tax and the tool is built around Indian slabs, so ₹ with
// lakh/crore grouping is correct there and `formatCurrency` stays pinned to it.
//
// EMI and Interest are NOT India-specific — a loan repayment is the same
// arithmetic everywhere — and they format through `formatMoney` below with a
// currency the visitor chooses. Pinning those to ₹ showed a US or EU visitor
// "₹12,34,567.89" for a figure that had nothing to do with rupees.
export const MONEY_LOCALE = "en-IN";
export const MONEY_CURRENCY = "INR";

/**
 * Formats a monetary amount with the ₹ symbol and Indian digit grouping.
 * Always two decimals, because money always has two.
 *
 * For anything that is not intrinsically Indian, use `formatMoney`.
 */
export function formatCurrency(value, options = {}) {
  if (!Number.isFinite(value)) return "—";

  return getFormatter(MONEY_LOCALE, {
    style: "currency",
    currency: MONEY_CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
}

/**
 * Formats a monetary amount in a chosen currency.
 *
 * `currency` is an entry from CURRENCIES in calculatorCurrency.js — the object,
 * not the code, so this module needs no lookup table and no import cycle. Its
 * `locale` field is deliberately used rather than the visitor's own locale:
 * the two are different questions, and the reasoning is documented at length in
 * that module.
 *
 * The decimal count comes from the currency rather than being fixed at 2.
 * "Money always has two decimals" is an assumption that holds across most of
 * this list and fails visibly on JPY and IDR, where a fractional unit does not
 * exist and "¥1,180.00" reads as broken. Intl knows the right value per
 * currency, so the explicit `decimals` field is only consulted when set.
 */
export function formatMoney(value, currency, options = {}) {
  if (!Number.isFinite(value)) return "—";
  if (!currency) return formatCurrency(value, options);

  const fractionDigits = currency.decimals ?? 2;

  return getFormatter(currency.locale, {
    style: "currency",
    currency: currency.code,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    ...options,
  }).format(value);
}

/**
 * Formats a general-purpose number for display.
 *
 * Unlike a fixed maximumFractionDigits, this keeps small values legible: it
 * falls back to significant-digit formatting once a value is small enough that
 * decimal-place rounding would flatten it to zero. That is what stops the unit
 * converter printing "0" for a genuine 0.0000001 result.
 */
export function formatNumber(value, options = {}) {
  const { maximumFractionDigits = 6, minimumFractionDigits = 0 } = options;

  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";

  const magnitude = Math.abs(value);

  // Too small to survive decimal-place rounding: switch to significant digits
  // so the user sees the actual value rather than a misleading zero.
  if (magnitude < Math.pow(10, -maximumFractionDigits)) {
    // Below this, fixed notation is unreadable and Intl switches to a long
    // string of zeroes — exponential is the honest rendering.
    if (magnitude < 1e-9) {
      return value.toExponential(4).replace(/e([+-])(\d)$/, "e$1$2");
    }
    return getFormatter(undefined, {
      maximumSignificantDigits: 4,
      useGrouping: true,
    }).format(value);
  }

  return getFormatter(undefined, {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping: true,
  }).format(value);
}

/**
 * Formats a percentage for display. Percentages read badly with six decimals
 * and badly with zero, so two is the default.
 */
export function formatPercent(value, options = {}) {
  const { maximumFractionDigits = 2 } = options;
  if (!Number.isFinite(value)) return "—";

  // A small but genuinely non-zero percentage must not render as "0%" — that
  // is the same misleading-zero failure formatNumber() guards against, and it
  // shows up on a real effective-rate row. Rounding -0.004 also yields the
  // string "-0%", which reads as a typo. Below the visible resolution, fall
  // back to significant digits so the value is still the value.
  const magnitude = Math.abs(value);
  if (value !== 0 && magnitude < Math.pow(10, -maximumFractionDigits) / 2) {
    return `${formatNumber(value)}%`;
  }

  return `${getFormatter(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
    useGrouping: true,
  }).format(value)}%`;
}

/**
 * Formats a whole-number count with grouping ("1,24,500 days").
 */
export function formatCount(value) {
  if (!Number.isFinite(value)) return "—";
  return getFormatter(undefined, { maximumFractionDigits: 0, useGrouping: true }).format(value);
}

/**
 * Produces a plain-text version of a result for the copy-to-clipboard button.
 * Rows are `{ label, value }`; the output is one `label: value` per line.
 */
export function formatResultForCopy(rows) {
  return rows
    .filter((row) => row && row.label != null && row.value != null)
    .map((row) => `${row.label}: ${row.value}`)
    .join("\n");
}
