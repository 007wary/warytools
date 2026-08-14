// The currency list and locale detection shared by the money calculators.
//
// Why this module exists: `formatCurrency` was hardcoded to en-IN/INR for every
// calculator on the site. That is correct for GST — an Indian tax, whose slabs
// the tool is built around — and wrong for EMI and Interest, which are
// universal. A visitor in Berlin or Ohio computing a loan repayment was shown
// "₹12,34,567.89": the wrong symbol, and lakh/crore grouping that reads as a
// typo to anyone outside South Asia.
//
// Two things are deliberately separated here, because conflating them is what
// makes currency pickers wrong:
//
//   - The **currency** decides the symbol and the decimal count.
//   - The **locale** decides the grouping and where the symbol sits.
//
// They are not the same choice. Rupees are grouped 12,34,567 in en-IN and
// 1,234,567 everywhere else; euros are "1.234,56 €" in de-DE and "€1,234.56" in
// en-IE. Pairing each currency with the locale it is actually written in is the
// only way the output looks native rather than merely symbol-swapped.

/**
 * Currencies offered by the EMI and Interest calculators.
 *
 * Deliberately a curated list, not every ISO 4217 code. A dropdown of 180
 * entries is worse than one of fifteen: these cover the large economies plus
 * the ones this site's traffic actually comes from, and `Intl` handles any of
 * them correctly. Adding one is a single line — the format functions read the
 * table rather than switching on the code.
 *
 * `locale` is the formatting convention for that currency, per the note above.
 * `decimals` is omitted when it is the usual 2; JPY has none (there is no such
 * thing as a fractional yen), and rendering "¥1,180.00" is visibly wrong to a
 * Japanese reader. Intl knows this per-currency, so the field exists only for
 * the places we need the number ourselves.
 */
export const CURRENCIES = [
  { code: "USD", locale: "en-US", label: "US Dollar", symbol: "$" },
  { code: "EUR", locale: "de-DE", label: "Euro", symbol: "€" },
  { code: "GBP", locale: "en-GB", label: "British Pound", symbol: "£" },
  { code: "INR", locale: "en-IN", label: "Indian Rupee", symbol: "₹" },
  { code: "JPY", locale: "ja-JP", label: "Japanese Yen", symbol: "¥", decimals: 0 },
  { code: "CNY", locale: "zh-CN", label: "Chinese Yuan", symbol: "¥" },
  { code: "CAD", locale: "en-CA", label: "Canadian Dollar", symbol: "$" },
  { code: "AUD", locale: "en-AU", label: "Australian Dollar", symbol: "$" },
  { code: "SGD", locale: "en-SG", label: "Singapore Dollar", symbol: "$" },
  { code: "AED", locale: "ar-AE", label: "UAE Dirham", symbol: "د.إ" },
  { code: "SAR", locale: "ar-SA", label: "Saudi Riyal", symbol: "﷼" },
  { code: "ZAR", locale: "en-ZA", label: "South African Rand", symbol: "R" },
  { code: "NGN", locale: "en-NG", label: "Nigerian Naira", symbol: "₦" },
  { code: "BRL", locale: "pt-BR", label: "Brazilian Real", symbol: "R$" },
  { code: "MXN", locale: "es-MX", label: "Mexican Peso", symbol: "$" },
  { code: "CHF", locale: "de-CH", label: "Swiss Franc", symbol: "CHF" },
  { code: "SEK", locale: "sv-SE", label: "Swedish Krona", symbol: "kr" },
  { code: "PKR", locale: "en-PK", label: "Pakistani Rupee", symbol: "₨" },
  { code: "BDT", locale: "bn-BD", label: "Bangladeshi Taka", symbol: "৳" },
  { code: "IDR", locale: "id-ID", label: "Indonesian Rupiah", symbol: "Rp", decimals: 0 },
  { code: "PHP", locale: "en-PH", label: "Philippine Peso", symbol: "₱" },
  { code: "NZD", locale: "en-NZ", label: "New Zealand Dollar", symbol: "$" },
];

/**
 * The SSR default.
 *
 * This is what the statically prerendered HTML contains, so it must be a
 * constant — see `detectCurrency` for why the real choice is made a commit
 * later. INR rather than USD because the existing audience is India-first; the
 * detection below is what makes that irrelevant for everyone else.
 */
export const DEFAULT_CURRENCY = "INR";

const BY_CODE = new Map(CURRENCIES.map((entry) => [entry.code, entry]));

/** Valid currency codes, for `decodeState`'s schema. */
export const CURRENCY_CODES = CURRENCIES.map((entry) => entry.code);

/**
 * Looks a currency up by code, falling back to the default.
 *
 * Never returns undefined: this feeds `Intl.NumberFormat`, which throws on an
 * unknown currency code, and the code can arrive from a hand-edited URL. A
 * calculator that renders in the wrong currency is a nuisance; one that throws
 * during render is a blank page.
 */
export function getCurrency(code) {
  return BY_CODE.get(code) || BY_CODE.get(DEFAULT_CURRENCY);
}

// Region -> currency for the regions whose currency is not inferable from the
// language tag alone. `en-GB` implies GBP, but plain `en` implies nothing, and
// `de-CH` is francs while `de-DE` is euros — so the region subtag is what is
// consulted, never the language.
const REGION_CURRENCY = {
  US: "USD", GB: "GBP", IN: "INR", JP: "JPY", CN: "CNY", CA: "CAD",
  AU: "AUD", SG: "SGD", AE: "AED", SA: "SAR", ZA: "ZAR", NG: "NGN",
  BR: "BRL", MX: "MXN", CH: "CHF", SE: "SEK", PK: "PKR", BD: "BDT",
  ID: "IDR", PH: "PHP", NZ: "NZD",
  // The eurozone. Listed explicitly rather than inferred, because "the EU" and
  // "the eurozone" are different sets — SEK above is the reason.
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR",
  AT: "EUR", IE: "EUR", PT: "EUR", FI: "EUR", GR: "EUR", SK: "EUR",
  SI: "EUR", LT: "EUR", LV: "EUR", EE: "EUR", LU: "EUR", MT: "EUR",
  CY: "EUR", HR: "EUR",
};

/**
 * Best-guess currency for this browser, or null if there is no confident answer.
 *
 * **Must not be called during render.** It reads `navigator`, which does not
 * exist on the server, and these calculator pages are statically prerendered —
 * the served HTML is byte-identical for every visitor. Calling this during the
 * hydration render (including from a lazy `useState` initialiser) would produce
 * different markup than the server sent. It is called from the same deferred
 * effect that restores URL state, for exactly the reason documented in
 * useCalculatorState.js.
 *
 * Returns null rather than a fallback so the caller can tell "detected INR"
 * from "detected nothing" — the difference matters when a URL parameter is
 * present, since an explicit choice in a shared link must win over a guess.
 */
export function detectCurrency() {
  if (typeof navigator === "undefined") return null;

  // `languages` is ordered by preference and is what the user actually
  // configured; `language` is the single top entry and is the older API.
  const tags = navigator.languages?.length
    ? navigator.languages
    : [navigator.language].filter(Boolean);

  for (const tag of tags) {
    const region = regionFromTag(tag);
    if (!region) continue;
    const code = REGION_CURRENCY[region];
    // A region we do not carry a currency for keeps scanning rather than
    // bailing: someone with ["fr-SN", "fr-FR"] is better served by EUR than by
    // the INR fallback.
    if (code && BY_CODE.has(code)) return code;
  }

  return null;
}

/**
 * Extracts the region subtag from a BCP 47 tag.
 *
 * `Intl.Locale` does this properly and is the right tool, but it throws on a
 * malformed tag and `navigator.languages` is not guaranteed well-formed. The
 * regex fallback handles the ordinary `xx-YY` shape; anything stranger simply
 * yields no region, which is a clean "no guess" rather than an exception.
 */
function regionFromTag(tag) {
  if (typeof tag !== "string" || !tag) return null;
  try {
    const region = new Intl.Locale(tag).region;
    if (region) return region.toUpperCase();
  } catch {
    // Fall through to the regex.
  }
  const match = /^[A-Za-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(tag);
  return match ? match[1].toUpperCase() : null;
}
