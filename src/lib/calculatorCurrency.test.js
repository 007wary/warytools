import { describe, it, expect, afterEach, vi } from "vitest";
import {
  CURRENCIES,
  CURRENCY_CODES,
  DEFAULT_CURRENCY,
  getCurrency,
  detectCurrency,
} from "./calculatorCurrency";
import { formatMoney, formatCurrency } from "./calculatorFormat";

// `navigator` does not exist in the node project, so detection tests define it
// and clean up after themselves. Deleting rather than restoring is correct:
// the property genuinely is absent here, and leaving a stub behind would let a
// later test's `typeof navigator === "undefined"` guard take the wrong branch.
function withNavigator(languages) {
  vi.stubGlobal("navigator", { languages });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the currency table", () => {
  it("carries no duplicate codes", () => {
    // A duplicate would make the <select> render two identical-looking options
    // and make `getCurrency` return whichever was inserted first — a silent
    // wrong answer rather than an error.
    expect(new Set(CURRENCY_CODES).size).toBe(CURRENCY_CODES.length);
  });

  it("pairs every currency with a locale that Intl actually knows", () => {
    // A typo'd locale tag does not throw — Intl falls back to the default
    // locale — so the currency would format with the wrong grouping and
    // nothing anywhere would report it. Checking the resolved locale is what
    // catches that.
    for (const currency of CURRENCIES) {
      const resolved = new Intl.NumberFormat(currency.locale, {
        style: "currency",
        currency: currency.code,
      }).resolvedOptions();

      // The resolved tag may add a script or drop a region, so compare the
      // language subtag rather than demanding an exact match.
      expect(resolved.locale.split("-")[0]).toBe(currency.locale.split("-")[0]);
      expect(resolved.currency).toBe(currency.code);
    }
  });

  it("every currency formats without throwing", () => {
    // Intl.NumberFormat throws on an unknown currency code. This runs the whole
    // table through the real formatter so a mistyped ISO code fails here rather
    // than blanking a calculator at render time.
    for (const currency of CURRENCIES) {
      expect(() => formatMoney(1234.5, currency)).not.toThrow();
      expect(formatMoney(1234.5, currency)).not.toBe("—");
    }
  });

  it("includes the default", () => {
    expect(CURRENCY_CODES).toContain(DEFAULT_CURRENCY);
  });
});

describe("getCurrency", () => {
  it("returns the matching entry", () => {
    expect(getCurrency("USD").code).toBe("USD");
    expect(getCurrency("USD").symbol).toBe("$");
  });

  it("falls back to the default for an unknown code rather than returning undefined", () => {
    // This value can arrive from a hand-edited URL and feeds Intl, which throws
    // on an unknown currency. A calculator that renders in the wrong currency
    // is a nuisance; one that throws during render is a blank page.
    expect(getCurrency("XXX").code).toBe(DEFAULT_CURRENCY);
    expect(getCurrency(undefined).code).toBe(DEFAULT_CURRENCY);
    expect(getCurrency("").code).toBe(DEFAULT_CURRENCY);
  });
});

describe("detectCurrency", () => {
  it("reads the region subtag, not the language", () => {
    // The whole point: `de` alone means nothing, but de-CH is francs and de-DE
    // is euros. Keying off the language would get one of them wrong.
    withNavigator(["de-CH"]);
    expect(detectCurrency()).toBe("CHF");

    withNavigator(["de-DE"]);
    expect(detectCurrency()).toBe("EUR");
  });

  it("distinguishes the English-speaking regions", () => {
    // en-* is the case that matters most here, since a single "en" fallback
    // would have sent every English speaker to one currency.
    withNavigator(["en-US"]);
    expect(detectCurrency()).toBe("USD");

    withNavigator(["en-GB"]);
    expect(detectCurrency()).toBe("GBP");

    withNavigator(["en-IN"]);
    expect(detectCurrency()).toBe("INR");

    withNavigator(["en-AU"]);
    expect(detectCurrency()).toBe("AUD");
  });

  it("returns null when the tag carries no region", () => {
    // "no confident answer" must be distinguishable from a real detection, so
    // the caller can leave the default in place instead of guessing.
    withNavigator(["en"]);
    expect(detectCurrency()).toBeNull();
  });

  it("returns null for a region we carry no currency for", () => {
    withNavigator(["is-IS"]);
    expect(detectCurrency()).toBeNull();
  });

  it("keeps scanning past a region it does not know", () => {
    // Someone with ["fr-SN", "fr-FR"] is better served by EUR than by giving up
    // at the first entry and falling back to the default.
    withNavigator(["fr-SN", "fr-FR"]);
    expect(detectCurrency()).toBe("EUR");
  });

  it("honours preference order", () => {
    withNavigator(["en-GB", "en-US"]);
    expect(detectCurrency()).toBe("GBP");
  });

  it("survives a malformed tag rather than throwing", () => {
    // navigator.languages is not guaranteed well-formed, and Intl.Locale throws
    // on a bad tag. A crash here would take the whole calculator down.
    withNavigator(["", "not a tag", "en-US"]);
    expect(() => detectCurrency()).not.toThrow();
    expect(detectCurrency()).toBe("USD");
  });

  it("returns null when navigator exists but exposes no language", () => {
    // This is the real server shape, and it is why the `typeof navigator`
    // guard alone is not enough: Node 21+ defines a global `navigator` whose
    // `language`/`languages` are undefined, so the guard does not fire and the
    // tag list must degrade to empty on its own. Without the `.filter(Boolean)`
    // this returned the default currency instead of "no answer".
    vi.stubGlobal("navigator", {});
    expect(detectCurrency()).toBeNull();
  });

  it("returns null when there is genuinely no navigator", () => {
    vi.stubGlobal("navigator", undefined);
    expect(detectCurrency()).toBeNull();
  });

  it("falls back to navigator.language when languages is absent", () => {
    vi.stubGlobal("navigator", { language: "en-CA" });
    expect(detectCurrency()).toBe("CAD");
  });
});

describe("formatMoney", () => {
  it("uses each currency's own grouping convention, not just its symbol", () => {
    // The bug this whole feature fixes: a US visitor was shown lakh/crore
    // grouping. Swapping only the symbol would still render "$12,34,567.89".
    expect(formatMoney(1234567.89, getCurrency("USD"))).toBe("$1,234,567.89");
    expect(formatMoney(1234567.89, getCurrency("INR"))).toBe("₹12,34,567.89");
  });

  it("drops the decimals on currencies that have no fractional unit", () => {
    // "¥1,180.00" is visibly wrong to a Japanese reader — there is no such
    // thing as a fractional yen. A fixed two-decimal rule gets this wrong.
    const yen = formatMoney(1180, getCurrency("JPY"));
    expect(yen).not.toContain(".");
    expect(yen).toContain("1,180");
  });

  it("keeps two decimals on ordinary currencies", () => {
    expect(formatMoney(1180, getCurrency("USD"))).toBe("$1,180.00");
  });

  it("renders a dash rather than 'Infinity' or 'NaN' for non-finite input", () => {
    expect(formatMoney(Infinity, getCurrency("USD"))).toBe("—");
    expect(formatMoney(NaN, getCurrency("USD"))).toBe("—");
  });

  it("falls back to the India-first formatter when handed no currency", () => {
    // Defensive: a caller that forgets the argument should still render money
    // rather than crashing on a property read of undefined.
    expect(formatMoney(1180, undefined)).toBe(formatCurrency(1180));
  });
});
